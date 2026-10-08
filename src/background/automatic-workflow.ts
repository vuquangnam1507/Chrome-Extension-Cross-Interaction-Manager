import { WorkflowManager } from './workflow-manager';
import { transition } from './state-machine';
import { readState, saveState } from '../services/storage.service';
import { pending, batchComplete } from '../services/task.service';
import { facebookUrl } from '../utils/url';
import { pageFromUrl } from '../config/pages';
import type { AutoOperation, Command, State, Task } from '../types';

export class AutomaticWorkflowManager extends WorkflowManager {
  async canAct(tabId: number, operationId: string) {
    const { automationStop } = await chrome.storage.local.get('automationStop');
    if (automationStop) return false;
    const s = await readState();
    const op = s.operation;
    if (
      this.stopped ||
      !s.running ||
      s.phase === 'ERROR' ||
      !op ||
      op.id !== operationId ||
      op.tabId !== tabId ||
      Date.now() >= op.deadline
    )
      return false;
    const tab = await chrome.tabs.get(tabId);
    const task = s.tasks.find((t) => t.id === op.taskId);
    if (!task || tab.windowId !== s.workflowWindowId) return false;
    return op.stage === 'FACEBOOK_ACTION'
      ? s.taskTabs[task.id] === tabId && facebookUrl(tab.url || '') === task.url
      : s.originTabId === tabId && pageFromUrl(tab.url || '') === task.page;
  }
  tabAttached(tabId: number, windowId: number) {
    return this.dispatch(async (s) => {
      if (
        s.running &&
        windowId !== s.workflowWindowId &&
        (s.originTabId === tabId || Object.values(s.taskTabs).includes(tabId))
      )
        throw Error('Tab workflow đã chuyển sang cửa sổ khác; đã hủy thao tác tự động.');
    });
  }
  override dispatch(fn: (s: State) => Promise<void>) {
    return super.dispatch(async (s) => {
      const wasRunning = s.running;
      await fn(s);
      if (!wasRunning && s.running && !this.stopped)
        await chrome.storage.local.set({ automationStop: false });
      await this.advance(s);
    });
  }
  override command(c: Command) {
    if (c.type === 'STOP') {
      this.stopped = true;
      // Out-of-band cancellation reaches content scripts without waiting for the command queue.
      void chrome.storage.local.set({ automationStop: true });
    }
    return super.command(c);
  }
  private async begin(s: State, stage: AutoOperation['stage'], task: Task, tabId: number) {
    const tab = await chrome.tabs.get(tabId);
    if (this.stopped || !s.running) return;
    if (s.workflowWindowId === null || tab.windowId !== s.workflowWindowId)
      throw Error('Tab không thuộc cửa sổ Chrome của workflow.');
    if (stage === 'FACEBOOK_ACTION') {
      if (s.taskTabs[task.id] !== tabId || facebookUrl(tab.url || '') !== task.url)
        throw Error('Tab Facebook đã đổi URL hoặc không thuộc công việc hiện tại.');
    } else if (s.originTabId !== tabId || pageFromUrl(tab.url || '') !== task.page) {
      throw Error('Tab nguồn đã đổi trang; không tiếp tục thao tác.');
    }
    s.operation = {
      id: crypto.randomUUID(),
      stage,
      taskId: task.id,
      tabId,
      deadline: Date.now() + 30000,
    };
    s.loadDeadline = null;
    this.log(
      s,
      {
        OPEN_TASK: 'Tự bấm nút công việc trên trang nguồn',
        FACEBOOK_ACTION: `Đang thực hiện ${task.kind} trên Facebook`,
        CLAIM_REWARD: 'Đang nhận thưởng công việc',
        CLAIM_BATCH: 'Đang nhận tất cả xu',
      }[stage],
    );
    // Persist intent before sending. Worker recovery never resends an in-flight click.
    await saveState(s);
    if (this.stopped) return;
    const reply = await chrome.tabs.sendMessage(tabId, {
      type: 'AUTO_STEP',
      operation: s.operation,
      task,
      config: s.settings.adapters[task.page],
    });
    if (!reply?.ok)
      throw Error(reply?.error || 'Content script chưa sẵn sàng. Tải lại tab rồi Start lại.');
  }
  private async advance(s: State) {
    if (!s.running || this.stopped || s.operation || s.phase === 'ERROR') return;
    const task = s.tasks.find((t) => t.id === s.currentTaskId);
    if (s.phase === 'TASK_AVAILABLE' && task) {
      transition(s, 'WAITING_USER_ACTION');
      await this.begin(s, 'OPEN_TASK', task, s.originTabId!);
    } else if (s.phase === 'TASK_COMPLETED' && task) {
      if (task.page !== 'subcheofbvip' && !s.rewardedTasks.includes(task.id)) {
        await this.begin(s, 'CLAIM_REWARD', task, s.originTabId!);
      } else await this.nextTask(s);
    } else if (s.phase === 'PAGE_COMPLETED' && s.tasks.length) {
      if (this.page(s) === 'subcheofbvip') {
        if (!batchComplete(s) || !s.tasks.every((t) => s.verifiedTasks.includes(t.id)))
          throw Error(
            'Danh sách nhóm chưa có đủ kết quả Follow được xác minh; không tự nhận thưởng.',
          );
        if (!s.batchRewardConfirmed) await this.begin(s, 'CLAIM_BATCH', s.tasks[0], s.originTabId!);
        else await this.finish(s);
      } else await this.finish(s);
    }
  }
  private async nextTask(s: State) {
    const next = pending(s)[0];
    if (next) {
      s.currentTaskId = next.id;
      transition(s, 'TASK_AVAILABLE');
    } else transition(s, 'PAGE_COMPLETED');
    await this.advance(s);
  }
  observeTab(tab: chrome.tabs.Tab) {
    return this.dispatch(async (s) => {
      const op = s.operation;
      if (s.running && op && tab.id === op.tabId) {
        const activeTask = s.tasks.find((t) => t.id === op.taskId);
        if (
          tab.windowId !== s.workflowWindowId ||
          !activeTask ||
          (op.stage === 'FACEBOOK_ACTION'
            ? facebookUrl(tab.url || '') !== activeTask.url
            : pageFromUrl(tab.url || '') !== activeTask.page)
        )
          throw Error('Tab đang thực thi đã đổi URL hoặc cửa sổ; đã hủy thao tác.');
      }
      if (!s.running || this.stopped || !op || op.stage !== 'OPEN_TASK' || tab.id === undefined)
        return;
      const task = s.tasks.find((t) => t.id === op.taskId);
      if (
        !task ||
        tab.openerTabId !== s.originTabId ||
        tab.windowId !== s.workflowWindowId ||
        facebookUrl(tab.url || tab.pendingUrl || '') !== task.url
      )
        return;
      s.taskTabs[task.id] = tab.id;
      if (tab.status !== 'complete') return;
      s.operation = null;
      transition(s, 'WAITING_CONFIRMATION');
      await this.begin(s, 'FACEBOOK_ACTION', task, tab.id);
    });
  }
  automaticResult(
    message: { operationId: string; ok: boolean; verified?: boolean; detail?: string },
    tab: chrome.tabs.Tab,
    url: string,
  ) {
    return this.dispatch(async (s) => {
      const op = s.operation;
      if (!s.running || this.stopped || !op || op.id !== message.operationId || tab.id !== op.tabId)
        return;
      const task = s.tasks.find((t) => t.id === op.taskId);
      if (!task || tab.windowId !== s.workflowWindowId) throw Error('Tab đã rời phạm vi workflow.');
      if (
        op.stage === 'FACEBOOK_ACTION'
          ? facebookUrl(url) !== task.url
          : pageFromUrl(url) !== task.page
      )
        throw Error('URL thay đổi khi đang thực hiện công việc.');
      if (!message.ok) throw Error(message.detail || 'Không thể hoàn thành bước tự động.');
      if (op.stage === 'OPEN_TASK') {
        this.log(s, 'Đã bấm nút gốc, đang chờ tab Facebook của công việc.');
        return;
      }
      if (!message.verified)
        throw Error('Chưa có dấu hiệu DOM xác nhận kết quả; không đánh dấu hoàn thành.');
      s.operation = null;
      this.log(s, (message.detail || 'Bước tự động đã có kết quả DOM').slice(0, 240));
      if (op.stage === 'FACEBOOK_ACTION') {
        s.completedTasks = [...new Set([...s.completedTasks, task.id])];
        s.verifiedTasks = [...new Set([...s.verifiedTasks, task.id])];
        s.rewardTaskId = task.id;
        transition(s, 'TASK_COMPLETED');
      } else if (op.stage === 'CLAIM_REWARD') {
        s.rewardedTasks = [...new Set([...s.rewardedTasks, task.id])];
        await this.nextTask(s);
      } else {
        s.batchRewardConfirmed = true;
        s.rewardedTasks = [...new Set([...s.rewardedTasks, ...s.tasks.map((t) => t.id)])];
        await this.finish(s);
      }
    });
  }
  override tabRemoved(id: number) {
    return this.dispatch(async (s) => {
      if (s.operation?.tabId === id)
        throw Error('Tab đang thực thi đã bị đóng; workflow đã tạm dừng.');
      for (const [taskId, tabId] of Object.entries(s.taskTabs))
        if (tabId === id) delete s.taskTabs[taskId];
      if (s.originTabId === id) {
        s.originTabId = null;
        if (s.running) throw Error('Tab nguồn đã đóng.');
      }
    });
  }
}
