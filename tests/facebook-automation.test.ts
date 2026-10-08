// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { initialState } from '../src/config/pages';
import type { State, Task } from '../src/types';
let state: State;
let listener: (m: unknown, s: unknown, r: unknown) => void;
type Message = { type: string; operationId?: string; ok?: boolean; verified?: boolean };
let messages: Message[];
const task: Task = {
  id: 'likepostvipcheo:https://www.facebook.com/123',
  url: 'https://www.facebook.com/123',
  page: 'likepostvipcheo',
  kind: 'LIKE',
  label: 'LIKE',
};
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  messages = [];
  state = initialState();
  state.running = true;
  state.phase = 'WAITING_CONFIRMATION';
  state.operation = {
    id: 'like-operation',
    stage: 'FACEBOOK_ACTION',
    taskId: task.id,
    tabId: 11,
    deadline: Date.now() + 30000,
  };
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 1, height: 1 },
  ] as unknown as DOMRectList);
  vi.stubGlobal('location', { href: task.url, pathname: '/123' });
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension',
      onMessage: { addListener: vi.fn((fn) => (listener = fn)) },
      sendMessage: vi.fn(async (m: Message) => {
        messages.push(m);
        return { ok: true };
      }),
    },
    storage: {
      onChanged: { addListener: vi.fn() },
      local: { get: vi.fn(async () => ({ state, automationStop: false })) },
    },
  });
  await import('../src/content/facebook');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function start() {
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
  await vi.advanceTimersByTimeAsync(0);
}
it('tự click div marker được cung cấp và chỉ báo thành công sau khi trạng thái thay đổi', async () => {
  document.body.innerHTML = '<main><div data-ad-rendering-role="like_button"></div></main>';
  const button = document.querySelector<HTMLElement>('[data-ad-rendering-role]')!;
  const click = vi.fn(() => button.setAttribute('aria-pressed', 'true'));
  button.addEventListener('click', click);
  await start();
  expect(click).toHaveBeenCalledOnce();
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
    ok: true,
    verified: true,
  });
});
it('click đúng nút cha khi marker chỉ là phần tử rỗng nằm bên trong', async () => {
  document.body.innerHTML =
    '<main><div role="button" aria-label="Thích"><div data-ad-rendering-role="like_button"></div></div></main>';
  const parent = document.querySelector<HTMLElement>('[role="button"]')!;
  const marker = document.querySelector<HTMLElement>('[data-ad-rendering-role]')!;
  Object.defineProperty(marker, 'getClientRects', { value: () => [] });
  const childClick = vi.fn();
  marker.addEventListener('click', childClick);
  const parentClick = vi.fn(() => parent.setAttribute('aria-pressed', 'true'));
  parent.addEventListener('click', parentClick);
  await start();
  expect(parentClick).toHaveBeenCalledOnce();
  expect(childClick).not.toHaveBeenCalled();
});
it('marker đã Like không bị click lần nữa', async () => {
  document.body.innerHTML =
    '<main><div data-ad-rendering-role="like_button" aria-pressed="true"></div></main>';
  const click = vi.fn();
  document.querySelector('[data-ad-rendering-role]')!.addEventListener('click', click);
  await start();
  expect(click).not.toHaveBeenCalled();
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
    ok: true,
    verified: true,
  });
});
it('click không đổi trạng thái thì timeout, không nhận thưởng dựa vào click', async () => {
  document.body.innerHTML = '<main><div data-ad-rendering-role="like_button"></div></main>';
  const click = vi.fn();
  document.querySelector('[data-ad-rendering-role]')!.addEventListener('click', click);
  await start();
  expect(click).toHaveBeenCalledOnce();
  expect(messages.some((m) => m.type === 'AUTO_RESULT')).toBe(false);
  await vi.advanceTimersByTimeAsync(20000);
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({ ok: false });
  expect(click).toHaveBeenCalledOnce();
});
