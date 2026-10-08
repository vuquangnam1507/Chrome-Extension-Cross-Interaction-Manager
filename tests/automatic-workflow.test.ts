import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AutomaticWorkflowManager } from '../src/background/automatic-workflow';
import { initialState, pageUrl } from '../src/config/pages';
import type { State, Task, PageId } from '../src/types';
let state: State;
let manager: AutomaticWorkflowManager;
let tabs: Map<number, chrome.tabs.Tab>;
let automationStop = false;
function task(page: PageId = 'likepostvipcheo', number = 123): Task {
  const url = `https://www.facebook.com/${number}`;
  return {
    id: `${page}:${url}`,
    url,
    page,
    kind: page.startsWith('like') ? 'LIKE' : 'FOLLOW',
    label: 'Task',
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  state = initialState();
  tabs = new Map();
  automationStop = false;
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => ({ state: structuredClone(state), automationStop })),
        set: vi.fn(async (data) => {
          if (data.state) state = structuredClone(data.state);
          if (data.automationStop !== undefined) automationStop = data.automationStop;
        }),
      },
    },
    alarms: { clear: vi.fn(async () => true), create: vi.fn(async () => {}) },
    tabs: {
      create: vi.fn(async ({ url, windowId }) => {
        const tab = {
          id: 10,
          windowId,
          url,
          status: 'complete' as const,
          index: 0,
          active: true,
          pinned: false,
          highlighted: false,
          incognito: false,
        };
        tabs.set(10, tab);
        return tab;
      }),
      get: vi.fn(async (id) => {
        const tab = tabs.get(id);
        if (!tab) throw Error('Tab not found');
        return tab;
      }),
      update: vi.fn(async (id, props) => {
        Object.assign(tabs.get(id)!, props);
        return tabs.get(id);
      }),
      sendMessage: vi.fn(async () => ({ ok: true })),
    },
  });
  manager = new AutomaticWorkflowManager();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function start(page: PageId = 'likepostvipcheo', tasks = [task(page)]) {
  await manager.command({
    type: 'START',
    windowId: 7,
    enabled: {
      likepostvipcheo: page === 'likepostvipcheo',
      likepostvipre: page === 'likepostvipre',
      subcheo: page === 'subcheo',
      subcheofbvip: page === 'subcheofbvip',
    },
  });
  await manager.pageReady(10);
  await manager.accept(
    { type: 'SCAN', page, token: state.scanToken!, tasks, status: 'ok', detail: '' },
    10,
    pageUrl(page),
  );
}
async function openFacebook(t = task(), id = 11) {
  const tab: chrome.tabs.Tab = {
    ...tabs.get(10)!,
    id,
    url: t.url,
    openerTabId: 10,
    windowId: 7,
    status: 'complete',
  };
  tabs.set(id, tab);
  await manager.observeTab(tab);
  return tab;
}
async function result(ok = true, verified = true) {
  const op = state.operation!;
  const tab = tabs.get(op.tabId)!;
  await manager.automaticResult(
    { operationId: op.id, ok, verified, detail: ok ? 'DOM verified' : 'DOM không phù hợp' },
    tab,
    tab.url!,
  );
}
it('Start tự bấm nút gốc, không cần command OPEN', async () => {
  await start();
  expect(state.operation?.stage).toBe('OPEN_TASK');
  expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(
    10,
    expect.objectContaining({ type: 'AUTO_STEP', task: task() }),
  );
  expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  expect(chrome.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ windowId: 7 }));
});
it('tự chạy trọn luồng mở → Like → thưởng → chuyển trang', async () => {
  await start();
  await openFacebook();
  expect(state.operation?.stage).toBe('FACEBOOK_ACTION');
  await result();
  expect(state.verifiedTasks).toContain(task().id);
  expect(state.operation?.stage).toBe('CLAIM_REWARD');
  await result();
  expect(state.rewardedTasks).toContain(task().id);
  expect(state.phase).toBe('WAITING_NEXT_PAGE');
  expect(state.dueAt).not.toBeNull();
});
it('bỏ qua mọi tab khác cửa sổ, khác opener hoặc khác URL', async () => {
  await start();
  const original = structuredClone(state.operation);
  for (const overrides of [
    { windowId: 8 },
    { openerTabId: 99 },
    { url: 'https://www.facebook.com/999' },
  ]) {
    await manager.observeTab({
      ...tabs.get(10)!,
      id: 99,
      url: task().url,
      openerTabId: 10,
      windowId: 7,
      ...overrides,
    });
    expect(state.operation).toEqual(original);
  }
  expect(state.taskTabs).toEqual({});
});
it('không thực thi trước khi tab Facebook tải xong và không gửi trùng khi READY lặp', async () => {
  await start();
  const tab = {
    ...tabs.get(10)!,
    id: 11,
    url: task().url,
    openerTabId: 10,
    status: 'loading' as const,
  };
  tabs.set(11, tab);
  await manager.observeTab(tab);
  expect(state.operation?.stage).toBe('OPEN_TASK');
  tab.status = 'complete' as 'loading';
  await manager.observeTab(tab);
  await manager.observeTab(tab);
  expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3);
});
it('Stop vô hiệu hóa kết quả đến muộn và phát tín hiệu hủy', async () => {
  await start();
  await openFacebook();
  const op = state.operation!;
  const fb = tabs.get(11)!;
  await manager.command({ type: 'STOP' });
  expect(automationStop).toBe(true);
  await manager.automaticResult({ operationId: op.id, ok: true, verified: true }, fb, fb.url!);
  expect(state.phase).toBe('STOPPED');
  expect(state.verifiedTasks).toEqual([]);
  expect(state.operation).toBeNull();
});
it('claim nhóm chỉ sau đủ kết quả Follow, không claim từng task', async () => {
  const first = task('subcheofbvip'),
    second = task('subcheofbvip', 456);
  await start('subcheofbvip', [first, second]);
  await openFacebook(first);
  await result();
  expect(state.operation?.stage).toBe('OPEN_TASK');
  expect(state.currentTaskId).toBe(second.id);
  await openFacebook(second, 12);
  await result();
  expect(state.operation?.stage).toBe('CLAIM_BATCH');
  expect(
    vi
      .mocked(chrome.tabs.sendMessage)
      .mock.calls.some(([, m]) => m.operation?.stage === 'CLAIM_REWARD'),
  ).toBe(false);
  await result();
  expect(state.batchRewardConfirmed).toBe(true);
  expect(state.rewardedTasks).toHaveLength(2);
});
it('không nhận thưởng khi chỉ click mà chưa xác minh kết quả Facebook', async () => {
  await start();
  await openFacebook();
  await result(true, false);
  expect(state.phase).toBe('ERROR');
  expect(state.verifiedTasks).toEqual([]);
  expect(state.rewardedTasks).toEqual([]);
});
it('không báo hoàn thành nhận thưởng khi thiếu thông báo thành công', async () => {
  await start();
  await openFacebook();
  await result();
  await result(false);
  expect(state.phase).toBe('ERROR');
  expect(state.rewardedTasks).toEqual([]);
});
it('worker khôi phục không phát lại thao tác; timeout chỉ dừng', async () => {
  await start();
  vi.clearAllTimers();
  manager = new AutomaticWorkflowManager();
  await manager.restore();
  expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30000);
  expect(state.phase).toBe('ERROR');
  expect(state.operation).toBeNull();
  expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
});
it('tab đang thực hiện đóng thì dừng, tab không thuộc workflow không ảnh hưởng', async () => {
  await start();
  await openFacebook();
  await manager.tabRemoved(99);
  expect(state.phase).toBe('WAITING_CONFIRMATION');
  await manager.tabRemoved(11);
  expect(state.phase).toBe('ERROR');
});
it('báo cáo từ tab khác hoặc operation cũ không làm tiến bước', async () => {
  await start();
  await openFacebook();
  const original = structuredClone(state.operation);
  await manager.automaticResult(
    { operationId: 'stale', ok: true, verified: true },
    tabs.get(11)!,
    task().url,
  );
  await manager.automaticResult(
    { operationId: original!.id, ok: true, verified: true },
    tabs.get(10)!,
    task().url,
  );
  expect(state.operation).toEqual(original);
});
