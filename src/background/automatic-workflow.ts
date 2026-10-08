import { WorkflowManager } from './workflow-manager';
import { transition } from './state-machine';
import { readState, saveState } from '../services/storage.service';
import { pending } from '../services/task.service';
import { facebookUrl, sameFacebookTarget, matchesFacebookOperation } from '../utils/url';
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
      ? s.taskTabs[task.id] === tabId &&
          matchesFacebookOperation(tab.url || '', task.url, op.documentUrl)
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
  private async begin(
    s: State,
    stage: AutoOperation['stage'],
    task: Task,
    tabId: number,
    documentUrl?: string,
  ) {
    const tab = await chrome.tabs.get(tabId);
    if (this.stopped || !s.running) return;
    if (s.workflowWindowId === null || tab.windowId !== s.workflowWindowId)
      throw Error('Tab không thuộc cửa sổ Chrome của workflow.');
    if (stage === 'FACEBOOK_ACTION') {
      if (
        s.taskTabs[task.id] !== tabId ||
        !matchesFacebookOperation(tab.url || '', task.url, documentUrl)
      )
        throw Error('Tab Facebook đã đổi URL hoặc không thuộc công việc hiện tại.');
    } else if (s.originTabId !== tabId || pageFromUrl(tab.url || '') !== task.page) {
      throw Error('Tab nguồn đã đổi trang; không tiếp tục thao tác.');
    }
    const existingTabs =
      stage === 'OPEN_TASK' ? await chrome.tabs.query({ windowId: s.workflowWindowId }) : [];
    if (this.stopped) return;
    s.operation = {
      ...(documentUrl ? { documentUrl } : {}),
      ...(stage === 'OPEN_TASK'
        ? {
            opening: {
              existingTabIds: existingTabs.flatMap((t) => (t.id === undefined ? [] : [t.id])),
              candidates: [],
            },
          }
        : {}),
      id: crypto.randomUUID(),
      stage,
      taskId: task.id,
      tabId,
      deadline: Date.now() + (stage === 'OPEN_TASK' ? 30000 : 50000),
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
        if (!s.tasks.every((t) => s.verifiedTasks.includes(t.id) || s.skippedTasks.includes(t.id)))
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
  private candidate(
    s: State,
    tab: chrome.tabs.Tab,
    sourceKnown = false,
    requestedUrl = '',
    ready = false,
  ) {
    const op = s.operation;
    if (
      !s.running ||
      this.stopped ||
      !op ||
      op.stage !== 'OPEN_TASK' ||
      !op.opening ||
      tab.id === undefined ||
      tab.id === s.originTabId ||
      tab.windowId !== s.workflowWindowId ||
      op.opening.existingTabIds.includes(tab.id)
    )
      return null;
    const task = s.tasks.find((t) => t.id === op.taskId);
    if (!task) return null;
    let candidate = op.opening.candidates.find((c) => c.tabId === tab.id);
    if (candidate?.blocked) return null;
    sourceKnown = sourceKnown || tab.openerTabId === s.originTabId;
    if (!candidate) {
      if (!sourceKnown && !ready) return null;
      if (op.opening.candidates.length >= 20) return null;
      candidate = { tabId: tab.id, sourceKnown: false, requestedSeen: false, ready: false };
      op.opening.candidates.push(candidate);
    }
    if (sourceKnown && !candidate.sourceKnown) {
      candidate.sourceKnown = true;
      this.log(s, `Đã nhận nguồn mở tab ${tab.id} từ trang công việc.`);
    }
    candidate.ready ||= ready;
    if (ready) candidate.readyUrl = facebookUrl(tab.url || '') || undefined;
    candidate.requestedSeen ||= [requestedUrl, tab.pendingUrl || '', tab.url || ''].some((url) =>
      task.sourceButtonKey && !task.url ? !!facebookUrl(url) : sameFacebookTarget(url, task.url),
    );
    return candidate;
  }
  private async attachReadyTab(s: State, tab: chrome.tabs.Tab) {
    const op = s.operation;
    const candidate = op?.opening?.candidates.find((c) => c.tabId === tab.id);
    const task = s.tasks.find((t) => t.id === op?.taskId);
    if (
      !op ||
      op.stage !== 'OPEN_TASK' ||
      !candidate?.sourceKnown ||
      !candidate.requestedSeen ||
      !task ||
      tab.id === undefined ||
      tab.windowId !== s.workflowWindowId
    )
      return;
    if (task.sourceButtonKey && !task.url) {
      const resolved = facebookUrl(tab.url || '');
      if (!resolved) return;
      if (
        op.opening!.candidates.filter((c) => c.sourceKnown && c.requestedSeen && !c.blocked)
          .length !== 1
      )
        throw Error('Nút nhiệm vụ mở nhiều tab Facebook; chưa xác định duy nhất tab cần Follow.');
      if (s.tasks.some((t) => t.id !== task.id && t.url && sameFacebookTarget(t.url, resolved)))
        throw Error('Nhiều nút nhiệm vụ mở cùng tài khoản Facebook; dừng để tránh Follow trùng.');
      task.url = resolved;
    }
    if (!matchesFacebookOperation(tab.url || '', task.url, candidate.documentUrl)) return;
    s.taskTabs[task.id] = tab.id;
    if (
      !(candidate.ready && candidate.readyUrl === facebookUrl(tab.url || '')) &&
      tab.status !== 'complete'
    )
      return;
    this.log(s, `Đã ghép tab Facebook ${tab.id}; chuyển sang thực hiện ${task.kind}.`);
    s.operation = null;
    transition(s, 'WAITING_CONFIRMATION');
    await this.begin(s, 'FACEBOOK_ACTION', task, tab.id, facebookUrl(tab.url || '')!);
  }
  observeTab(tab: chrome.tabs.Tab, ready = false, reportedUrl = tab.url || '') {
    return this.dispatch(async (s) => {
      // Events can wait behind other messages. Validate the current tab, not a
      // stale onUpdated snapshot from before Facebook finished canonicalizing its URL.
      if (tab.id === undefined) return;
      try {
        tab = await chrome.tabs.get(tab.id);
      } catch {
        return; // onRemoved handles closure; never act on an obsolete snapshot.
      }
      const op = s.operation;
      if (s.running && op && tab.id === op.tabId) {
        const activeTask = s.tasks.find((t) => t.id === op.taskId);
        if (tab.windowId !== s.workflowWindowId)
          throw Error(
            `Tab đang thực thi đã chuyển cửa sổ (${s.workflowWindowId} → ${tab.windowId}); đã hủy thao tác.`,
          );
        if (
          !activeTask ||
          (op.stage === 'FACEBOOK_ACTION'
            ? !matchesFacebookOperation(tab.url || '', activeTask.url, op.documentUrl)
            : pageFromUrl(tab.url || '') !== activeTask.page)
        )
          throw Error(
            'Tab đang thực thi đã chuyển sang URL không khớp công việc hoặc permalink đã xác minh; đã hủy thao tác.',
          );
      }
      this.candidate(
        s,
        tab,
        false,
        '',
        ready &&
          !!facebookUrl(reportedUrl) &&
          facebookUrl(reportedUrl) === facebookUrl(tab.url || ''),
      );
      await this.attachReadyTab(s, tab);
    });
  }
  navigationTarget(event: {
    sourceTabId: number;
    sourceFrameId: number;
    tabId: number;
    url: string;
  }) {
    return this.dispatch(async (s) => {
      if (
        !s.running ||
        this.stopped ||
        s.operation?.stage !== 'OPEN_TASK' ||
        event.sourceTabId !== s.originTabId ||
        event.sourceFrameId !== 0
      )
        return;
      let tab: chrome.tabs.Tab;
      try {
        tab = await chrome.tabs.get(event.tabId);
      } catch {
        return;
      }
      this.candidate(s, tab, true, event.url);
      await this.attachReadyTab(s, tab);
    });
  }
  navigationCommitted(event: {
    tabId: number;
    frameId: number;
    url: string;
    transitionType: string;
    transitionQualifiers: string[];
  }) {
    return this.dispatch(async (s) => {
      if (!s.running || this.stopped || s.operation?.stage !== 'OPEN_TASK' || event.frameId !== 0)
        return;
      let tab: chrome.tabs.Tab;
      try {
        tab = await chrome.tabs.get(event.tabId);
      } catch {
        return;
      }
      const candidate = this.candidate(s, tab);
      if (!candidate?.sourceKnown) return;
      const task = s.tasks.find((t) => t.id === s.operation!.taskId)!;
      const manual =
        event.transitionType === 'typed' ||
        event.transitionQualifiers.some((q) => ['from_address_bar', 'forward_back'].includes(q));
      const redirected = event.transitionQualifiers.some((q) =>
        ['server_redirect', 'client_redirect'].includes(q),
      );
      if (manual) {
        candidate.blocked = true;
        candidate.sourceKnown = false;
        candidate.requestedSeen = false;
        candidate.documentUrl = undefined;
        return;
      }
      if (sameFacebookTarget(event.url, task.url)) candidate.requestedSeen = true;
      else if (candidate.requestedSeen && redirected && facebookUrl(event.url)) {
        candidate.documentUrl = facebookUrl(event.url)!;
        this.log(s, `Đã xác minh chuyển hướng Facebook trong tab ${event.tabId}.`);
      }
      await this.attachReadyTab(s, tab);
    });
  }
  private async reconcileOpening() {
    const s = await readState();
    if (
      !s.running ||
      this.stopped ||
      s.operation?.stage !== 'OPEN_TASK' ||
      s.workflowWindowId === null
    )
      return;
    const tabs = await chrome.tabs.query({ windowId: s.workflowWindowId });
    for (const tab of tabs) await this.observeTab(tab);
  }
  override async restore() {
    await super.restore();
    await this.reconcileOpening();
    return readState();
  }
  override async wake() {
    await this.reconcileOpening();
    return super.wake();
  }
  automaticResult(
    message: {
      operationId: string;
      ok: boolean;
      verified?: boolean;
      detail?: string;
      skipped?: string;
    },
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
          ? !matchesFacebookOperation(url, task.url, op.documentUrl)
          : pageFromUrl(url) !== task.page
      )
        throw Error('URL thay đổi khi đang thực hiện công việc.');
      if (!message.ok) throw Error(message.detail || 'Không thể hoàn thành bước tự động.');
      if (op.stage === 'OPEN_TASK') {
        this.log(s, 'Đã bấm nút gốc, đang chờ tab Facebook của công việc.');
        return;
      }
      if (
        message.skipped === 'missing-follow-control' &&
        op.stage === 'FACEBOOK_ACTION' &&
        task.page === 'subcheofbvip' &&
        !message.verified
      ) {
        s.operation = null;
        s.skippedTasks = [...new Set([...s.skippedTasks, task.id])];
        this.log(
          s,
          'Bỏ qua nhiệm vụ Follow VIP: không xác định được nút Follow sau một lần kiểm tra trong 5 giây.',
        );
        transition(s, 'TASK_COMPLETED');
        await this.closeFollowTab(s, task, tab.id!, op.documentUrl);
        await this.nextTask(s);
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
        if (task.page === 'subcheofbvip')
          await this.closeFollowTab(s, task, tab.id!, op.documentUrl);
      } else if (op.stage === 'CLAIM_REWARD') {
        s.rewardedTasks = [...new Set([...s.rewardedTasks, task.id])];
        await this.nextTask(s);
      } else {
        s.batchRewardConfirmed = true;
        s.rewardedTasks = [
          ...new Set([
            ...s.rewardedTasks,
            ...s.tasks.filter((t) => s.verifiedTasks.includes(t.id)).map((t) => t.id),
          ]),
        ];
        // The reward control reloads the list itself. Start a fresh scan on the
        // same document; never navigate away or click reload a second time.
        const roundIds = new Set(s.tasks.map((t) => t.id));
        s.completedTasks = s.completedTasks.filter((id) => !roundIds.has(id));
        s.skippedTasks = s.skippedTasks.filter((id) => !roundIds.has(id));
        s.verifiedTasks = s.verifiedTasks.filter((id) => !roundIds.has(id));
        s.tasks = [];
        s.currentTaskId = null;
        s.rewardTaskId = null;
        s.batchRewardConfirmed = false;
        s.emptyRetryCount = 0;
        this.log(s, 'Đã nhận thưởng lượt Follow VIP; chờ danh sách mới trên cùng trang.');
        await this.scan(s);
      }
    });
  }
  private async closeFollowTab(s: State, task: Task, tabId: number, documentUrl?: string) {
    if (s.taskTabs[task.id] !== tabId) return;
    const current = await chrome.tabs.get(tabId);
    if (
      this.stopped ||
      !s.running ||
      current.windowId !== s.workflowWindowId ||
      !matchesFacebookOperation(current.url || '', task.url, documentUrl)
    )
      return;
    await saveState(s);
    if (this.stopped) return;
    await chrome.tabs.remove(tabId);
    delete s.taskTabs[task.id];
    this.log(s, 'Đã đóng tab Follow đã xử lý do workflow mở.');
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
