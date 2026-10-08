import { initialState, pageUrl, pageFromUrl, validateSettings } from '../config/pages';
import type { State, Command, Scan, Task } from '../types';
import { readState, saveState } from '../services/storage.service';
import { pending, dedupe, batchComplete } from '../services/task.service';
import { transition, nextIndex } from './state-machine';
import { focus, openTask } from './tab-manager';
import { facebookUrl } from '../utils/url';
export class WorkflowManager {
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private stopVersion = 0;
  dispatch(fn: (s: State) => Promise<void>) {
    const run = this.queue.then(async () => {
      const s = await readState();
      try {
        await fn(s);
      } catch (e) {
        s.error = e instanceof Error ? e.message : String(e);
        transition(s, 'ERROR');
        s.dueAt = null;
        s.loadDeadline = null;
        this.log(s, s.error);
      }
      await saveState(s);
      await this.schedule(s);
      return s;
    });
    this.queue = run.catch(() => {});
    return run;
  }
  log(s: State, text: string) {
    s.activityLogs = [{ time: Date.now(), text }, ...s.activityLogs].slice(0, 250);
  }
  page(s: State) {
    return s.settings.order[s.currentPageIndex];
  }
  async schedule(s: State) {
    clearTimeout(this.timer);
    await chrome.alarms.clear('crossengage');
    const due = s.dueAt ?? s.loadDeadline;
    if (!s.running || this.stopped || due === null) return;
    this.timer = setTimeout(
      () => {
        void this.wake();
      },
      Math.max(0, due - Date.now()),
    );
    await chrome.alarms.create('crossengage', { when: Math.max(Date.now() + 30000, due) });
  }
  async wake() {
    return this.dispatch(async (s) => {
      if (!s.running || this.stopped) return;
      if (s.dueAt !== null && Date.now() >= s.dueAt) {
        s.currentPageIndex = nextIndex(s);
        await this.navigate(s);
      } else if (s.loadDeadline !== null && Date.now() >= s.loadDeadline)
        throw Error(
          'Trang tải chậm hoặc content script chưa sẵn sàng. Kiểm tra tab gốc rồi Quét lại.',
        );
    });
  }
  async restore() {
    return this.dispatch(async (s) => {
      if (!s.running) {
        s.phase = 'STOPPED';
        s.dueAt = null;
        s.loadDeadline = null;
        return;
      }
      if (s.phase === 'WAITING_USER_ACTION') {
        transition(s, 'WAITING_CONFIRMATION');
        this.log(s, 'Khôi phục thao tác mở tab; kiểm tra tab Facebook trước khi mở lại.');
      }
      if (s.originTabId === null) throw Error('Không còn tab gốc. Dừng rồi Start để tạo lại.');
      try {
        await chrome.tabs.get(s.originTabId);
      } catch {
        throw Error('Tab gốc đã đóng. Dừng rồi Start để tạo lại.');
      }
    });
  }
  async navigate(s: State) {
    if (this.stopped || !s.running) return;
    transition(s, 'LOADING_PAGE');
    s.tasks = [];
    s.currentTaskId = null;
    s.rewardTaskId = null;
    s.batchRewardConfirmed = false;
    s.dueAt = null;
    s.scanToken = crypto.randomUUID();
    s.loadDeadline = Date.now() + 30000;
    s.lastTransitionTime = Date.now();
    await saveState(s);
    if (this.stopped) return;
    const url = pageUrl(this.page(s));
    if (s.originTabId !== null) {
      const tab = await chrome.tabs.get(s.originTabId);
      if (!pageFromUrl(tab.url || ''))
        throw Error('Tab gốc đã đổi URL; không tự chuyển hướng. Dừng rồi Start lại.');
      await chrome.tabs.update(s.originTabId, { url });
    } else {
      const tab = await chrome.tabs.create({ url, active: true });
      s.originTabId = tab.id ?? null;
    }
    this.log(s, `Đang tải ${this.page(s)}`);
  }
  async scan(s: State) {
    if (!s.running || this.stopped || s.originTabId === null) return;
    transition(s, 'SCANNING_TASKS');
    s.error = null;
    s.scanToken = crypto.randomUUID();
    s.loadDeadline = Date.now() + 20000;
    await saveState(s);
    await chrome.tabs.sendMessage(s.originTabId, {
      type: 'SCAN_REQUEST',
      page: this.page(s),
      token: s.scanToken,
      config: s.settings.adapters[this.page(s)],
    });
  }
  async pageReady(tabId: number) {
    return this.dispatch(async (s) => {
      if (s.running && !this.stopped && s.originTabId === tabId && s.phase === 'LOADING_PAGE')
        await this.scan(s);
    });
  }
  async accept(report: Scan, tabId: number, url: string) {
    return this.dispatch(async (s) => {
      if (
        !s.running ||
        this.stopped ||
        s.originTabId !== tabId ||
        report.page !== this.page(s) ||
        pageFromUrl(url) !== report.page ||
        report.token !== s.scanToken ||
        ![
          'SCANNING_TASKS',
          'TASK_AVAILABLE',
          'WAITING_CONFIRMATION',
          'TASK_COMPLETED',
          'PAGE_COMPLETED',
        ].includes(s.phase)
      )
        return;
      s.loadDeadline = null;
      if (report.status === 'login')
        throw Error('Tuongtaccheo có dấu hiệu chưa đăng nhập. Đăng nhập ở tab gốc rồi Quét lại.');
      if (report.status === 'offline') throw Error('Mất kết nối mạng. Kết nối lại rồi Quét lại.');
      if (report.status === 'unknown') {
        if (s.tasks.length === 0)
          throw Error(report.detail || 'Chưa xác minh được danh sách; cần cấu hình adapter.');
        if (s.phase === 'SCANNING_TASKS')
          transition(s, pending(s).length ? 'TASK_AVAILABLE' : 'PAGE_COMPLETED');
        return;
      }
      const valid = report.tasks
        .filter(
          (t: Task) =>
            t.page === report.page &&
            facebookUrl(t.url) === t.url &&
            t.id === `${t.page}:${t.url}` &&
            t.kind === (t.page.startsWith('like') ? 'LIKE' : 'FOLLOW'),
        )
        .slice(0, 2000);
      s.tasks = dedupe([...s.tasks, ...valid]);
      const p = pending(s);
      if (p.length) {
        s.emptyVisits = 0;
        s.currentTaskId = p.some((t) => t.id === s.currentTaskId) ? s.currentTaskId : p[0].id;
        if (s.phase === 'SCANNING_TASKS' || s.phase === 'TASK_COMPLETED')
          transition(s, 'TASK_AVAILABLE');
        else if (s.phase === 'PAGE_COMPLETED') {
          transition(s, 'SCANNING_TASKS');
          transition(s, 'TASK_AVAILABLE');
        }
      } else if (s.tasks.length === 0 && report.status === 'empty') {
        s.emptyVisits++;
        if (s.emptyVisits >= s.settings.order.filter((p) => s.settings.enabled[p]).length) {
          await this.stop(s);
          this.log(s, 'Đã kiểm tra hết các trang đang bật, không có công việc mới.');
        } else await this.finish(s);
      } else if (s.phase === 'SCANNING_TASKS') transition(s, 'PAGE_COMPLETED');
      this.log(s, `Phát hiện ${s.tasks.length} công việc; còn ${p.length}.`);
    });
  }
  async finish(s: State) {
    transition(s, 'PAGE_COMPLETED');
    transition(s, 'WAITING_NEXT_PAGE');
    s.loadDeadline = null;
    s.scanToken = null;
    s.dueAt = Math.max(Date.now() + s.settings.delaySeconds * 1000, s.lastTransitionTime + 5000);
    this.log(s, 'Chờ chuyển trang.');
  }
  async stop(s: State) {
    s.running = false;
    transition(s, 'STOPPED');
    s.dueAt = null;
    s.loadDeadline = null;
    s.scanToken = null;
    clearTimeout(this.timer);
    await chrome.alarms.clear('crossengage');
    this.log(s, 'Đã dừng. Giữ nguyên các tab.');
  }
  command(c: Command) {
    if (c.type === 'STOP') {
      this.stopVersion++;
      this.stopped = true;
      clearTimeout(this.timer);
    }
    const version = this.stopVersion;
    return this.dispatch(async (s) => {
      if (c.type === 'GET') return;
      if (c.type === 'STOP') {
        await this.stop(s);
        return;
      }
      if (c.type === 'START') {
        if (s.running || version !== this.stopVersion) return;
        this.stopped = false;
        validateSettings(s.settings);
        s.running = true;
        s.error = null;
        s.emptyVisits = 0;
        transition(s, 'IDLE');
        if (!s.settings.enabled[this.page(s)]) s.currentPageIndex = nextIndex(s);
        if (s.originTabId !== null) {
          try {
            const t = await chrome.tabs.get(s.originTabId);
            if (!pageFromUrl(t.url || '')) s.originTabId = null;
          } catch {
            s.originTabId = null;
          }
        }
        await this.navigate(s);
        return;
      }
      if (c.type === 'SETTINGS') {
        if (s.running) throw Error('Dừng trước khi thay đổi cấu hình.');
        validateSettings(c.settings);
        s.settings = c.settings;
        this.log(s, 'Đã lưu cấu hình.');
        return;
      }
      if (c.type === 'CLEAR') {
        if (s.running) throw Error('Dừng trước khi xóa lịch sử.');
        const fresh = initialState();
        fresh.settings = s.settings;
        Object.assign(s, fresh);
        return;
      }
      if (c.type === 'BACK') {
        if (s.originTabId === null) throw Error('Không còn tab gốc.');
        await focus(s.originTabId);
        return;
      }
      if (!s.running || this.stopped) throw Error('Quy trình đang dừng.');
      if (c.type === 'RESCAN') {
        if (s.phase === 'WAITING_NEXT_PAGE') throw Error('Đang chờ chuyển trang.');
        await this.scan(s);
        return;
      }
      if (c.type === 'HIGHLIGHT') {
        if (s.originTabId === null) throw Error('Không còn tab gốc.');
        const batch = this.page(s) === 'subcheofbvip';
        if (batch && !batchComplete(s))
          throw Error('Cần xác nhận toàn bộ danh sách trước khi nhận tất cả xu.');
        await focus(s.originTabId);
        const result = await chrome.tabs.sendMessage(s.originTabId, {
          type: 'HIGHLIGHT',
          page: this.page(s),
          batch,
          taskId: s.rewardTaskId,
          config: s.settings.adapters[this.page(s)],
        });
        if (!result?.ok) throw Error(result?.error || 'Không tìm thấy nút nhận thưởng.');
        return;
      }
      if (c.type === 'SKIP_PAGE') {
        s.skippedTasks = [...new Set([...s.skippedTasks, ...pending(s).map((t) => t.id)])];
        await this.finish(s);
        return;
      }
      if (c.type === 'FINISH_PAGE') {
        if (pending(s).length) throw Error('Còn công việc chưa xác nhận hoặc bỏ qua.');
        if (this.page(s) === 'subcheofbvip' && !s.batchRewardConfirmed)
          throw Error('Cần xác nhận đã nhận thưởng nhóm.');
        await this.finish(s);
        return;
      }
      if (c.type === 'REWARD_CONFIRMED') {
        if (this.page(s) !== 'subcheofbvip' || !batchComplete(s))
          throw Error('Danh sách Follow chưa hoàn thành.');
        s.batchRewardConfirmed = true;
        this.log(s, 'Người dùng xác nhận đã nhận thưởng nhóm.');
        await this.finish(s);
        return;
      }
      const task = s.tasks.find((t) => t.id === s.currentTaskId);
      if (!task) throw Error('Không có công việc hiện tại.');
      if (c.type === 'OPEN') {
        if (!['TASK_AVAILABLE', 'WAITING_CONFIRMATION'].includes(s.phase))
          throw Error('Công việc chưa sẵn sàng.');
        transition(s, 'WAITING_USER_ACTION');
        await saveState(s);
        if (this.stopped) return;
        await openTask(s, task, () => this.stopped);
        transition(s, 'WAITING_CONFIRMATION');
        this.log(s, `Đã mở ${task.kind}; chờ người dùng xác nhận.`);
        return;
      }
      if (c.type === 'CONFIRM' || c.type === 'SKIP_TASK') {
        if (c.type === 'CONFIRM' && s.phase !== 'WAITING_CONFIRMATION')
          throw Error('Mở công việc trước khi xác nhận.');
        if (c.type === 'SKIP_TASK' && !['TASK_AVAILABLE', 'WAITING_CONFIRMATION'].includes(s.phase))
          throw Error('Không thể bỏ qua ở trạng thái hiện tại.');
        const key = c.type === 'CONFIRM' ? 'completedTasks' : 'skippedTasks';
        s[key] = [...new Set([...s[key], task.id])];
        if (c.type === 'CONFIRM') s.rewardTaskId = task.id;
        transition(s, 'TASK_COMPLETED');
        this.log(
          s,
          c.type === 'CONFIRM'
            ? 'Người dùng xác nhận hoàn thành (không xác minh kết quả Facebook).'
            : 'Đã bỏ qua công việc.',
        );
        const next = pending(s)[0];
        if (next) {
          s.currentTaskId = next.id;
          transition(s, 'TASK_AVAILABLE');
        } else transition(s, 'PAGE_COMPLETED');
      }
    });
  }
  async tabRemoved(id: number) {
    return this.dispatch(async (s) => {
      for (const [key, value] of Object.entries(s.taskTabs))
        if (value === id) delete s.taskTabs[key];
      if (s.originTabId === id) {
        s.originTabId = null;
        if (s.running) throw Error('Tab gốc đã đóng. Dừng rồi Start để tiếp tục.');
      }
    });
  }
}
