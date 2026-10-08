// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { initialState, pageUrl } from '../src/config/pages';
import type { State, Task, AutoOperation } from '../src/types';
let state: State;
let listener: (m: unknown, s: unknown, r: unknown) => void;
let stopped = false;
type ResultMessage = { type: string; operationId?: string; ok?: boolean; verified?: boolean };
let messages: ResultMessage[] = [];
const task: Task = {
  id: 'likepostvipcheo:https://www.facebook.com/123',
  url: 'https://www.facebook.com/123',
  page: 'likepostvipcheo',
  kind: 'LIKE',
  label: 'LIKE',
};
beforeEach(async () => {
  vi.resetModules();
  state = initialState();
  state.running = true;
  state.phase = 'WAITING_USER_ACTION';
  state.tasks = [task];
  state.currentTaskId = task.id;
  stopped = false;
  messages = [];
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 1, height: 1 },
  ] as unknown as DOMRectList);
  vi.stubGlobal('location', { href: pageUrl(task.page) });
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension',
      onMessage: { addListener: vi.fn((fn) => (listener = fn)) },
      sendMessage: vi.fn(async (message: ResultMessage) => {
        messages.push(message);
        return { ok: true };
      }),
    },
    storage: {
      onChanged: { addListener: vi.fn() },
      local: { get: vi.fn(async () => ({ state, automationStop: stopped })) },
    },
  });
  document.body.innerHTML =
    '<div class="job"><button class="btn btn-default" title="https://www.facebook.com/123"></button><button id="reward">Nhận xu</button></div>';
  await import('../src/content/source-automation');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function run(stage: AutoOperation['stage']) {
  state.operation = {
    id: crypto.randomUUID(),
    taskId: task.id,
    tabId: 10,
    stage,
    deadline: Date.now() + 30000,
  };
  listener(
    {
      type: 'AUTO_STEP',
      operation: state.operation,
      task,
      config: state.settings.adapters[task.page],
    },
    { id: 'extension' },
    vi.fn(),
  );
  await vi.waitFor(() =>
    expect(
      messages.some((m) => m.type === 'AUTO_RESULT' && m.operationId === state.operation!.id),
    ).toBe(true),
  );
  return messages.filter((m) => m.type === 'AUTO_RESULT').at(-1)!;
}

it('tự click nút gốc thay vì chỉ lấy URL mở bằng Tabs API', async () => {
  const click = vi.fn();
  document.querySelector('.btn')!.addEventListener('click', click);
  const result = await run('OPEN_TASK');
  expect(click).toHaveBeenCalledOnce();
  expect(result.ok).toBe(true);
});
it('Stop chặn click ngay cả khi message đã tới content script', async () => {
  const click = vi.fn();
  document.querySelector('.btn')!.addEventListener('click', click);
  stopped = true;
  expect((await run('OPEN_TASK')).ok).toBe(false);
  expect(click).not.toHaveBeenCalled();
});
it('tự nhận đúng thưởng trong container công việc và chờ thông báo mới', async () => {
  await run('OPEN_TASK');
  document.body.insertAdjacentHTML('beforeend', '<div role="alert">Nhận xu thành công</div>');
  const reward = document.querySelector('#reward')!;
  const click = vi.fn(() =>
    document.body.insertAdjacentHTML('beforeend', '<div role="alert">Nhận xu thành công</div>'),
  );
  reward.addEventListener('click', click);
  const result = await run('CLAIM_REWARD');
  expect(click).toHaveBeenCalledOnce();
  expect(result.verified).toBe(true);
});
it('bước cũ không được bấm lại khi runtime gửi trùng', async () => {
  const click = vi.fn();
  document.querySelector('.btn')!.addEventListener('click', click);
  await run('OPEN_TASK');
  listener(
    {
      type: 'AUTO_STEP',
      operation: state.operation,
      task,
      config: state.settings.adapters[task.page],
    },
    { id: 'extension' },
    vi.fn(),
  );
  expect(click).toHaveBeenCalledOnce();
});

it('nhận nhóm chờ nút nhiệm vụ biến mất rồi mới bấm và chờ thông báo thành công', async () => {
  document.body.insertAdjacentHTML('beforeend', '<button id="batch">Nhận tất cả xu</button>');
  const click = vi.fn(() =>
    document.body.insertAdjacentHTML('beforeend', '<div role="alert">Nhận xu thành công</div>'),
  );
  document.querySelector('#batch')!.addEventListener('click', click);
  const result = run('CLAIM_BATCH');
  await vi.waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalled());
  expect(click).not.toHaveBeenCalled();
  document.querySelector('.btn')!.remove();
  expect((await result).verified).toBe(true);
  expect(click).toHaveBeenCalledOnce();
});
