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
      remove: vi.fn(async (id: number) => {
        tabs.delete(id);
      }),
      query: vi.fn(async ({ windowId }) =>
        [...tabs.values()].filter((t) => t.windowId === windowId),
      ),
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
          selected: true,
          discarded: false,
          autoDiscardable: true,
          groupId: -1,
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
    expect(state.operation?.id).toBe(original!.id);
    expect(state.operation?.stage).toBe('OPEN_TASK');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
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
      .mock.calls.some(
        ([, m]) => (m as { operation?: { stage: string } }).operation?.stage === 'CLAIM_REWARD',
      ),
  ).toBe(false);
  await result();
  expect(state.batchRewardConfirmed).toBe(false);
  expect(state.rewardedTasks).toHaveLength(2);
  expect(state.phase).toBe('SCANNING_TASKS');
  expect(state.tasks).toEqual([]);
  expect(state.dueAt).toBeNull();
  const page = 'subcheofbvip';
  await manager.accept(
    { type: 'SCAN', page, token: state.scanToken!, tasks: [first], status: 'ok', detail: '' },
    10,
    pageUrl(page),
  );
  expect(state.operation?.stage).toBe('OPEN_TASK');
  expect(state.currentTaskId).toBe(first.id);
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
it('kiểm tra cửa sổ ngay trước click và hủy khi tab được chuyển cửa sổ', async () => {
  await start();
  await openFacebook();
  const id = state.operation!.id;
  expect(await manager.canAct(11, id)).toBe(true);
  expect(await manager.canAct(10, id)).toBe(false);
  tabs.get(11)!.windowId = 8;
  expect(await manager.canAct(11, id)).toBe(false);
  await manager.tabAttached(11, 8);
  expect(state.phase).toBe('ERROR');
});
it('tab đổi URL trong lúc đang làm thì hủy trước bước tiếp theo', async () => {
  await start();
  await openFacebook();
  tabs.get(11)!.url = 'https://www.facebook.com/999';
  await manager.observeTab(tabs.get(11)!);
  expect(state.phase).toBe('ERROR');
  expect(state.verifiedTasks).toEqual([]);
});
it('tab thiếu opener: dùng nguồn mở từ webNavigation và không chờ tải tài nguyên xong', async () => {
  await start();
  const tab = {
    ...tabs.get(10)!,
    id: 11,
    url: 'about:blank',
    status: 'loading' as chrome.tabs.Tab['status'],
  };
  tabs.set(11, tab);
  await manager.observeTab(tab);
  expect(state.operation?.stage).toBe('OPEN_TASK');
  await manager.navigationTarget({ sourceTabId: 10, sourceFrameId: 0, tabId: 11, url: task().url });
  tab.url = 'https://m.facebook.com/123/?ref=source&rdid=tracking';
  await manager.observeTab(tab, true);
  expect(state.operation?.stage).toBe('FACEBOOK_ACTION');
  expect(state.taskTabs[task().id]).toBe(11);
  expect(await manager.canAct(11, state.operation!.id)).toBe(true);
});
it('FB_READY đến trước nguồn điều hướng vẫn ghép tab khi bằng chứng nguồn tới sau', async () => {
  await start();
  const tab = {
    ...tabs.get(10)!,
    id: 11,
    url: task().url,
    status: 'loading' as chrome.tabs.Tab['status'],
  };
  tabs.set(11, tab);
  await manager.observeTab(tab, true);
  expect(state.operation?.stage).toBe('OPEN_TASK');
  await manager.navigationTarget({ sourceTabId: 10, sourceFrameId: 0, tabId: 11, url: task().url });
  expect(state.operation?.stage).toBe('FACEBOOK_ACTION');
});
it('webNavigation không nhận tab mở từ nguồn khác hoặc iframe', async () => {
  await start();
  const tab = { ...tabs.get(10)!, id: 11, url: task().url };
  tabs.set(11, tab);
  await manager.observeTab(tab, true);
  await manager.navigationTarget({ sourceTabId: 99, sourceFrameId: 0, tabId: 11, url: task().url });
  await manager.navigationTarget({ sourceTabId: 10, sourceFrameId: 2, tabId: 11, url: task().url });
  expect(state.operation?.stage).toBe('OPEN_TASK');
  expect(state.taskTabs).toEqual({});
});
it('không chiếm tab Facebook đã có trước click dù URL và opener đều khớp', async () => {
  const tab: chrome.tabs.Tab = {
    id: 20,
    url: task().url,
    openerTabId: 10,
    windowId: 7,
    status: 'complete',
    index: 0,
    active: false,
    pinned: false,
    highlighted: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
  };
  tabs.set(20, tab);
  await start();
  await manager.observeTab(tab, true);
  await manager.navigationTarget({ sourceTabId: 10, sourceFrameId: 0, tabId: 20, url: task().url });
  expect(state.operation?.stage).toBe('OPEN_TASK');
  expect(state.taskTabs).toEqual({});
});
it('chuyển hướng đã xác minh từ URL số sang permalink mới được dùng xuyên suốt thao tác', async () => {
  await start();
  const tab = {
    ...tabs.get(10)!,
    id: 11,
    url: 'https://www.facebook.com/person/posts/pfbidABC',
    status: 'loading' as chrome.tabs.Tab['status'],
  };
  tabs.set(11, tab);
  await manager.navigationTarget({ sourceTabId: 10, sourceFrameId: 0, tabId: 11, url: task().url });
  await manager.observeTab(tab, true);
  expect(state.operation?.stage).toBe('OPEN_TASK');
  await manager.navigationCommitted({
    tabId: 11,
    frameId: 0,
    url: tab.url,
    transitionType: 'link',
    transitionQualifiers: ['server_redirect'],
  });
  expect(state.operation?.stage).toBe('FACEBOOK_ACTION');
  expect(state.operation?.documentUrl).toBe(tab.url);
  expect(await manager.canAct(11, state.operation!.id)).toBe(true);
  await result();
  expect(state.operation?.stage).toBe('CLAIM_REWARD');
});
it('URL khác không có bằng chứng redirect không được nhận chỉ vì tab mở cùng nguồn', async () => {
  await start();
  const tab = { ...tabs.get(10)!, id: 11, url: 'https://www.facebook.com/999' };
  tabs.set(11, tab);
  await manager.navigationTarget({ sourceTabId: 10, sourceFrameId: 0, tabId: 11, url: task().url });
  await manager.navigationCommitted({
    tabId: 11,
    frameId: 0,
    url: tab.url,
    transitionType: 'link',
    transitionQualifiers: [],
  });
  await manager.observeTab(tab, true);
  expect(state.operation?.stage).toBe('OPEN_TASK');
});
it('worker restore tìm lại tab đã có nguồn xác minh mà không bấm mở lần hai', async () => {
  await start();
  const tab = {
    ...tabs.get(10)!,
    id: 11,
    url: 'about:blank',
    status: 'loading' as chrome.tabs.Tab['status'],
  };
  tabs.set(11, tab);
  await manager.navigationTarget({ sourceTabId: 10, sourceFrameId: 0, tabId: 11, url: task().url });
  vi.clearAllTimers();
  tab.url = task().url;
  tab.status = 'complete';
  manager = new AutomaticWorkflowManager();
  await manager.restore();
  expect(state.operation?.stage).toBe('FACEBOOK_ACTION');
  const sent = vi
    .mocked(chrome.tabs.sendMessage)
    .mock.calls.map(([, m]) => m as { operation?: { stage: string } });
  expect(sent.filter((m) => m.operation?.stage === 'OPEN_TASK')).toHaveLength(1);
});
it('Stop khi đang ghép tab thì mọi sự kiện điều hướng đến muộn không mở bước Like', async () => {
  await start();
  const tab = { ...tabs.get(10)!, id: 11, url: task().url };
  tabs.set(11, tab);
  await manager.command({ type: 'STOP' });
  await manager.navigationTarget({ sourceTabId: 10, sourceFrameId: 0, tabId: 11, url: task().url });
  await manager.observeTab(tab, true);
  expect(state.phase).toBe('STOPPED');
  expect(state.operation).toBeNull();
});

it('URL permalink đã xác minh đổi tracking trong bước Like không hủy thao tác', async () => {
  await start();
  await openFacebook();
  state.operation!.documentUrl = 'https://www.facebook.com/person/posts/pfbidABC';
  tabs.get(11)!.url = 'https://m.facebook.com/person/posts/pfbidABC/?rdid=new';
  const operationId = state.operation!.id;
  await manager.observeTab(tabs.get(11)!);
  expect(state.phase).not.toBe('ERROR');
  expect(await manager.canAct(11, operationId)).toBe(true);
});
it('sự kiện URL cũ trong hàng đợi không hủy tab hiện tại vẫn đúng nhiệm vụ', async () => {
  await start();
  await openFacebook();
  const snapshot = { ...tabs.get(11)!, url: 'about:blank' };
  await manager.observeTab(snapshot);
  expect(state.operation?.stage).toBe('FACEBOOK_ACTION');
  expect(state.running).toBe(true);
});
it('sự kiện cũ đúng URL không che giấu tab hiện đã sang bài khác', async () => {
  await start();
  await openFacebook();
  const snapshot = { ...tabs.get(11)! };
  tabs.get(11)!.url = 'https://www.facebook.com/999';
  await manager.observeTab(snapshot);
  expect(state.phase).toBe('ERROR');
});

it('Follow VIP không cần URL trước click: ghép tab mới theo nguồn và đóng sau xác nhận', async () => {
  const buttonTask: Task = {
    ...task('subcheofbvip'),
    id: 'subcheofbvip:button:job1',
    sourceButtonKey: 'job1',
    url: '',
  };
  await start('subcheofbvip', [buttonTask]);
  expect(state.operation?.stage).toBe('OPEN_TASK');
  const tab = { ...tabs.get(10)!, id: 11, openerTabId: 10, url: 'https://www.facebook.com/456' };
  tabs.set(11, tab);
  await manager.observeTab(tab, true);
  expect(state.operation?.stage).toBe('FACEBOOK_ACTION');
  expect(state.tasks[0].url).toBe(tab.url);
  await manager.automaticResult(
    { operationId: state.operation!.id, ok: true, verified: true },
    tab,
    tab.url,
  );
  expect(chrome.tabs.remove).toHaveBeenCalledWith(11);
  expect(state.operation?.stage).toBe('CLAIM_BATCH');
});
it('nút chưa biết URL không được nhận tab Facebook thiếu nguồn mở', async () => {
  const buttonTask: Task = {
    ...task('subcheofbvip'),
    id: 'subcheofbvip:button:job2',
    sourceButtonKey: 'job2',
    url: '',
  };
  await start('subcheofbvip', [buttonTask]);
  const tab = { ...tabs.get(10)!, id: 11, url: 'https://www.facebook.com/456' };
  tabs.set(11, tab);
  await manager.observeTab(tab, true);
  expect(state.operation?.stage).toBe('OPEN_TASK');
  expect(chrome.tabs.remove).not.toHaveBeenCalled();
});

it('Follow lỗi không đóng tab và không nhận tất cả xu', async () => {
  await start('subcheofbvip', [task('subcheofbvip')]);
  await openFacebook();
  const tab = tabs.get(11)!;
  await manager.automaticResult(
    { operationId: state.operation!.id, ok: false, detail: 'Chưa có kết quả' },
    tab,
    tab.url!,
  );
  expect(state.phase).toBe('ERROR');
  expect(chrome.tabs.remove).not.toHaveBeenCalled();
  expect(state.batchRewardConfirmed).toBe(false);
});
it('bỏ qua Follow VIP thiếu nút chuyển nhiệm vụ kế, không ghi hoàn thành giả', async () => {
  const first = task('subcheofbvip'),
    second = task('subcheofbvip', 456);
  await start('subcheofbvip', [first, second]);
  await openFacebook();
  const tab = tabs.get(11)!;
  await manager.automaticResult(
    {
      operationId: state.operation!.id,
      ok: true,
      verified: false,
      skipped: 'missing-follow-control',
    },
    tab,
    tab.url!,
  );
  expect(state.skippedTasks).toContain(first.id);
  expect(state.completedTasks).not.toContain(first.id);
  expect(state.verifiedTasks).not.toContain(first.id);
  expect(state.operation?.stage).toBe('OPEN_TASK');
  expect(state.operation?.taskId).toBe(second.id);
  expect(chrome.tabs.remove).toHaveBeenCalledWith(11);
});
it('toàn bộ Follow VIP đã xử lý dù bỏ qua vẫn tới bước nhận nhóm để trang xác nhận', async () => {
  await start('subcheofbvip', [task('subcheofbvip')]);
  await openFacebook();
  const tab = tabs.get(11)!;
  await manager.automaticResult(
    {
      operationId: state.operation!.id,
      ok: true,
      verified: false,
      skipped: 'missing-follow-control',
    },
    tab,
    tab.url!,
  );
  expect(state.operation?.stage).toBe('CLAIM_BATCH');
  expect(state.batchRewardConfirmed).toBe(false);
  expect(state.rewardedTasks).toEqual([]);
});
