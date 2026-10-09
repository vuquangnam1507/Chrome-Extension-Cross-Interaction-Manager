import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { initialState, pageUrl } from '../src/config/pages';
import { transition, nextIndex } from '../src/background/state-machine';
import { WorkflowManager } from '../src/background/workflow-manager';
import type { State, Task, PageId } from '../src/types';
import { dedupe } from '../src/services/task.service';
let stored: State;
let tabs: Map<number, { id: number; url: string; windowId: number }>;
let nextId: number;
let manager: WorkflowManager;
const task = (page: PageId = 'likepostvipcheo'): Task => ({
  id: `${page}:https://www.facebook.com/123`,
  page,
  url: 'https://www.facebook.com/123',
  kind: page.startsWith('like') ? 'LIKE' : 'FOLLOW',
  label: 'Công việc',
});
beforeEach(() => {
  vi.useFakeTimers();
  stored = initialState();
  tabs = new Map();
  nextId = 1;
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => ({ state: structuredClone(stored) })),
        set: vi.fn(async ({ state }) => {
          stored = structuredClone(state);
        }),
      },
    },
    alarms: { clear: vi.fn(async () => true), create: vi.fn(async () => {}) },
    tabs: {
      query: vi.fn(async () => []),
      create: vi.fn(async ({ url }) => {
        const t = { id: nextId++, url, windowId: 1 };
        tabs.set(t.id, t);
        return t;
      }),
      get: vi.fn(async (id) => {
        if (!tabs.has(id)) throw Error('Missing tab');
        return tabs.get(id);
      }),
      update: vi.fn(async (id, props) => {
        const t = tabs.get(id)!;
        Object.assign(t, props);
        return t;
      }),
      sendMessage: vi.fn(async () => ({ ok: true })),
    },
    windows: { update: vi.fn(async () => {}) },
  });
  manager = new WorkflowManager();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function ready(page: PageId = 'likepostvipcheo', tasks: Task[] = [task(page)]) {
  await manager.command({ type: 'START' });
  await manager.pageReady(stored.originTabId!);
  await manager.accept(
    { type: 'SCAN', page, token: stored.scanToken!, tasks, status: 'ok', detail: '' },
    stored.originTabId!,
    pageUrl(page),
  );
}
it('state machine chặn chuyển sai; Stop luôn được phép', () => {
  const s = initialState();
  expect(() => transition(s, 'WAITING_NEXT_PAGE')).toThrow();
  transition(s, 'IDLE');
  transition(s, 'LOADING_PAGE');
  transition(s, 'STOPPED');
  expect(s.phase).toBe('STOPPED');
});
it('chu kỳ 1 → 2 → 3 → 4 → 1, bỏ qua trang tắt', () => {
  const s = initialState();
  const indices = [];
  for (let n = 0; n < 4; n++) {
    s.currentPageIndex = nextIndex(s);
    indices.push(s.currentPageIndex);
  }
  expect(indices).toEqual([1, 2, 3, 0]);
  s.settings.enabled.likepostvipre = false;
  expect(nextIndex(s)).toBe(2);
});
it('chống trùng công việc', () => expect(dedupe([task(), task()])).toHaveLength(1));
it('Start nhiều lần chỉ tạo một tab, không tự mở Facebook', async () => {
  await Promise.all([manager.command({ type: 'START' }), manager.command({ type: 'START' })]);
  expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  expect(stored.running).toBe(true);
});
it('mở chủ động, tránh tab trùng, xác nhận lưu tiến độ', async () => {
  await ready();
  await manager.command({ type: 'OPEN' });
  await manager.command({ type: 'OPEN' });
  expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
  await manager.command({ type: 'CONFIRM' });
  expect(stored.completedTasks).toEqual([task().id]);
  expect(stored.phase).toBe('PAGE_COMPLETED');
  expect(stored.dueAt).toBeNull();
});
it('Stop hủy deadline và không chuyển hoặc đóng tab', async () => {
  await ready();
  await manager.command({ type: 'SKIP_PAGE' });
  await manager.command({ type: 'STOP' });
  await vi.advanceTimersByTimeAsync(60000);
  await manager.wake();
  expect(stored.phase).toBe('STOPPED');
  expect(stored.dueAt).toBeNull();
  expect(chrome.tabs.update).not.toHaveBeenCalled();
  expect(tabs.size).toBe(1);
});
it('chờ tối thiểu 5 giây; timer và alarm không chuyển trùng', async () => {
  await ready();
  await manager.command({ type: 'SKIP_PAGE' });
  await vi.advanceTimersByTimeAsync(4999);
  expect(stored.currentPageIndex).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  await manager.wake();
  expect(stored.currentPageIndex).toBe(1);
  expect(chrome.tabs.update).toHaveBeenCalledTimes(1);
});
it('khôi phục stopped không tự start', async () => {
  await manager.restore();
  await manager.wake();
  expect(stored.running).toBe(false);
  expect(chrome.tabs.create).not.toHaveBeenCalled();
});
it('worker mới khôi phục deadline lưu trong storage', async () => {
  await ready();
  await manager.command({ type: 'SKIP_PAGE' });
  vi.clearAllTimers();
  manager = new WorkflowManager();
  await manager.restore();
  await vi.advanceTimersByTimeAsync(5000);
  expect(stored.currentPageIndex).toBe(1);
});
it('batch Follow cần xác nhận nhận thưởng riêng', async () => {
  stored.currentPageIndex = 3;
  await ready('subcheofbvip');
  await manager.command({ type: 'OPEN' });
  await manager.command({ type: 'CONFIRM' });
  expect(stored.batchRewardConfirmed).toBe(false);
  expect(stored.dueAt).toBeNull();
  await manager.command({ type: 'HIGHLIGHT' });
  expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(
    stored.originTabId,
    expect.objectContaining({ type: 'HIGHLIGHT', batch: true }),
  );
  await manager.command({ type: 'REWARD_CONFIRMED' });
  expect(stored.phase).toBe('WAITING_NEXT_PAGE');
  expect(stored.batchRewardConfirmed).toBe(true);
});
it('không nhận thưởng nhóm nếu chưa hoàn thành toàn bộ', async () => {
  stored.currentPageIndex = 3;
  await ready('subcheofbvip');
  await manager.command({ type: 'REWARD_CONFIRMED' });
  expect(stored.phase).toBe('ERROR');
  expect(stored.batchRewardConfirmed).toBe(false);
  expect(stored.dueAt).toBeNull();
});
it('báo cáo scan cũ hoặc tab không thuộc workflow bị bỏ qua', async () => {
  await ready();
  const previous = structuredClone(stored.tasks);
  await manager.accept(
    {
      type: 'SCAN',
      page: 'likepostvipcheo',
      token: 'stale',
      tasks: [],
      status: 'empty',
      detail: '',
    },
    stored.originTabId!,
    pageUrl('likepostvipcheo'),
  );
  expect(stored.tasks).toEqual(previous);
});
it('tab Facebook đổi URL không bị điều hướng hoặc đóng', async () => {
  await ready();
  await manager.command({ type: 'OPEN' });
  const id = stored.taskTabs[task().id];
  tabs.get(id)!.url = 'https://www.facebook.com/999';
  await manager.command({ type: 'OPEN' });
  expect(tabs.get(id)!.url).toContain('/999');
  expect(stored.taskTabs[task().id]).not.toBe(id);
});
it('tab bị đóng cập nhật mapping, tab gốc đóng báo lỗi', async () => {
  await ready();
  await manager.command({ type: 'OPEN' });
  await manager.tabRemoved(stored.taskTabs[task().id]);
  expect(stored.taskTabs).toEqual({});
  await manager.tabRemoved(stored.originTabId!);
  expect(stored.phase).toBe('ERROR');
  expect(stored.originTabId).toBeNull();
});
it('selector không rõ không tự chuyển trang', async () => {
  await manager.command({ type: 'START' });
  await manager.pageReady(stored.originTabId!);
  await manager.accept(
    {
      type: 'SCAN',
      page: 'likepostvipcheo',
      token: stored.scanToken!,
      tasks: [],
      status: 'unknown',
      detail: 'Kiểm tra adapter',
    },
    stored.originTabId!,
    pageUrl('likepostvipcheo'),
  );
  expect(stored.phase).toBe('ERROR');
  expect(stored.dueAt).toBeNull();
});
it('tất cả trang rỗng vẫn tiếp tục vòng mới', async () => {
  await manager.command({ type: 'START' });
  for (let n = 0; n < 4; n++) {
    await manager.pageReady(stored.originTabId!);
    const page = stored.settings.order[stored.currentPageIndex];
    await manager.accept(
      { type: 'SCAN', page, token: stored.scanToken!, tasks: [], status: 'empty', detail: '' },
      stored.originTabId!,
      pageUrl(page),
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      await vi.advanceTimersByTimeAsync(3000);
      await manager.accept(
        { type: 'SCAN', page, token: stored.scanToken!, tasks: [], status: 'empty', detail: '' },
        stored.originTabId!,
        pageUrl(page),
      );
    }
    await vi.advanceTimersByTimeAsync(5000);
  }
  expect(stored.running).toBe(true);
  expect(stored.currentPageIndex).toBe(0);
  expect(stored.emptyVisits).toBe(4);
});
it('Stop ngay khi Start đang nằm trong hàng đợi không mở tab', async () => {
  await Promise.all([manager.command({ type: 'START' }), manager.command({ type: 'STOP' })]);
  expect(stored.running).toBe(false);
  expect(chrome.tabs.create).not.toHaveBeenCalled();
});
it('thưởng lẻ trỏ tới công việc vừa xong khi hàng đợi đã tiến lên', async () => {
  const t2 = {
    ...task(),
    id: 'likepostvipcheo:https://www.facebook.com/456',
    url: 'https://www.facebook.com/456',
  };
  await ready('likepostvipcheo', [task(), t2]);
  await manager.command({ type: 'OPEN' });
  await manager.command({ type: 'CONFIRM' });
  expect(stored.currentTaskId).toBe(t2.id);
  await manager.command({ type: 'HIGHLIGHT' });
  expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(
    stored.originTabId,
    expect.objectContaining({ batch: false, taskId: task().id }),
  );
});
it('cho phép bỏ qua trang khi selector không khớp', async () => {
  await ready();
  await manager.dispatch(async () => {
    throw Error('Không tìm thấy selector');
  });
  await manager.command({ type: 'SKIP_PAGE' });
  expect(stored.phase).toBe('WAITING_NEXT_PAGE');
});
it('tải chậm chỉ timeout một lần, không retry', async () => {
  await manager.command({ type: 'START' });
  await vi.advanceTimersByTimeAsync(30000);
  expect(stored.phase).toBe('ERROR');
  expect(stored.loadDeadline).toBeNull();
  await vi.advanceTimersByTimeAsync(60000);
  expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
});
it('DOM tạm biến mất không xóa snapshot công việc đang chờ', async () => {
  await ready();
  await manager.accept(
    {
      type: 'SCAN',
      page: 'likepostvipcheo',
      token: stored.scanToken!,
      tasks: [],
      status: 'unknown',
      detail: '',
    },
    stored.originTabId!,
    pageUrl('likepostvipcheo'),
  );
  expect(stored.tasks).toEqual([task()]);
  expect(stored.phase).toBe('TASK_AVAILABLE');
  expect(stored.dueAt).toBeNull();
});
it('Start chỉ một mục: mở đúng trang và không chuyển sang mục tắt', async () => {
  const enabled = {
    likepostvipcheo: false,
    likepostvipre: false,
    subcheo: true,
    subcheofbvip: false,
  };
  await manager.command({ type: 'START', enabled });
  expect(stored.settings.enabled).toEqual(enabled);
  expect(chrome.tabs.create).toHaveBeenCalledWith(
    expect.objectContaining({ url: pageUrl('subcheo') }),
  );
  await manager.pageReady(stored.originTabId!);
  await manager.command({ type: 'SKIP_PAGE' });
  await vi.advanceTimersByTimeAsync(5000);
  expect(stored.currentPageIndex).toBe(2);
  expect(chrome.tabs.update).toHaveBeenLastCalledWith(stored.originTabId, {
    url: pageUrl('subcheo'),
  });
});
it('Start hai mục theo thứ tự đã lưu và chỉ luân phiên hai mục đó', async () => {
  stored.settings.order = ['subcheofbvip', 'subcheo', 'likepostvipre', 'likepostvipcheo'];
  await manager.command({
    type: 'START',
    enabled: { likepostvipcheo: false, likepostvipre: true, subcheo: false, subcheofbvip: true },
  });
  expect(stored.currentPageIndex).toBe(0);
  for (const expected of [2, 0]) {
    await manager.pageReady(stored.originTabId!);
    await manager.command({ type: 'SKIP_PAGE' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(stored.currentPageIndex).toBe(expected);
  }
});
it('không mở tab nếu Start với tất cả mục bị tắt', async () => {
  await manager.command({
    type: 'START',
    enabled: { likepostvipcheo: false, likepostvipre: false, subcheo: false, subcheofbvip: false },
  });
  expect(stored.running).toBe(false);
  expect(chrome.tabs.create).not.toHaveBeenCalled();
});
async function reportEmpty() {
  const page = stored.settings.order[stored.currentPageIndex];
  await manager.accept(
    { type: 'SCAN', page, token: stored.scanToken!, tasks: [], status: 'empty', detail: '' },
    stored.originTabId!,
    pageUrl(page),
  );
}
it('Start cả bốn mục thì luân phiên đủ bốn trang trên một tab gốc', async () => {
  await manager.command({ type: 'START' });
  const visited: PageId[] = [];
  for (let n = 0; n < 4; n++) {
    visited.push(stored.settings.order[stored.currentPageIndex]);
    await manager.pageReady(stored.originTabId!);
    await manager.command({ type: 'SKIP_PAGE' });
    await vi.advanceTimersByTimeAsync(5000);
  }
  expect(visited).toEqual(['likepostvipcheo', 'likepostvipre', 'subcheo', 'subcheofbvip']);
  expect(stored.currentPageIndex).toBe(0);
  expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  expect(stored.running).toBe(true);
});
it('một trang chờ 5 giây rồi tải lại danh sách tại chỗ', async () => {
  await manager.command({
    type: 'START',
    enabled: { likepostvipcheo: true, likepostvipre: false, subcheo: false, subcheofbvip: false },
  });
  await manager.pageReady(stored.originTabId!);
  await reportEmpty();
  await vi.advanceTimersByTimeAsync(4999);
  expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(
    stored.originTabId,
    expect.objectContaining({ type: 'RELOAD_LIST', attempt: 1 }),
  );
  expect(chrome.tabs.update).not.toHaveBeenCalled();
  for (let n = 0; n < 6; n++) {
    await reportEmpty();
    await vi.advanceTimersByTimeAsync(5000);
  }
  await reportEmpty();
  expect(stored.running).toBe(true);
  expect(stored.emptyRetryCount).toBe(7);
  expect(stored.emptyRetryAt).toBe(Date.now() + 5000);
});
it('Stop hủy lần tải lại danh sách đang chờ', async () => {
  await manager.command({ type: 'START' });
  await manager.pageReady(stored.originTabId!);
  await reportEmpty();
  await manager.command({ type: 'STOP' });
  await vi.advanceTimersByTimeAsync(30000);
  expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
  expect(stored.emptyRetryAt).toBeNull();
});
it('có công việc mới thì hủy retry; thông báo empty trùng không lùi deadline', async () => {
  await manager.command({ type: 'START' });
  await manager.pageReady(stored.originTabId!);
  await reportEmpty();
  const deadline = stored.emptyRetryAt;
  await vi.advanceTimersByTimeAsync(1000);
  await reportEmpty();
  expect(stored.emptyRetryAt).toBe(deadline);
  await manager.accept(
    {
      type: 'SCAN',
      page: 'likepostvipcheo',
      token: stored.scanToken!,
      tasks: [task()],
      status: 'ok',
      detail: '',
    },
    stored.originTabId!,
    pageUrl('likepostvipcheo'),
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(stored.phase).toBe('TASK_AVAILABLE');
  expect(stored.emptyRetryAt).toBeNull();
  expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
});
it('khôi phục deadline tải lại sau khi worker bị tạm dừng', async () => {
  await manager.command({ type: 'START' });
  await manager.pageReady(stored.originTabId!);
  await reportEmpty();
  vi.clearAllTimers();
  manager = new WorkflowManager();
  await manager.restore();
  await vi.advanceTimersByTimeAsync(3000);
  await manager.wake();
  expect(stored.emptyRetryCount).toBe(1);
  expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
});
it('không tìm được nút tải lại thì báo lỗi, không tự chuyển trang', async () => {
  await manager.command({ type: 'START' });
  await manager.pageReady(stored.originTabId!);
  await reportEmpty();
  vi.mocked(chrome.tabs.sendMessage).mockResolvedValueOnce({
    ok: false,
    error: 'Không tìm thấy nút Tải lại danh sách',
  });
  await vi.advanceTimersByTimeAsync(3000);
  expect(stored.phase).toBe('ERROR');
  expect(stored.emptyRetryAt).toBeNull();
  expect(chrome.tabs.update).not.toHaveBeenCalled();
});
