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
it('luồng tự động chỉ click bài chính, không click Like bình luận', async () => {
  document.body.innerHTML =
    '<main><article><div id="post" data-ad-rendering-role="like_button"></div><article><button>Thích</button></article><article><button>Thích</button></article></article></main>';
  const post = document.querySelector('#post')!;
  const postClick = vi.fn(() => post.setAttribute('aria-pressed', 'true'));
  post.addEventListener('click', postClick);
  const commentClick = vi.fn();
  document.querySelectorAll('button').forEach((b) => b.addEventListener('click', commentClick));
  await start();
  expect(postClick).toHaveBeenCalledOnce();
  expect(commentClick).not.toHaveBeenCalled();
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
    ok: true,
    verified: true,
  });
});
it('chờ permalink tải muộn thay vì lỗi ngay khi ban đầu có nhiều article', async () => {
  document.body.innerHTML =
    '<main><article id="target"><div id="like" data-ad-rendering-role="like_button"></div></article><article><div data-ad-rendering-role="like_button"></div></article></main>';
  const like = document.querySelector('#like')!;
  const click = vi.fn(() => like.setAttribute('aria-pressed', 'true'));
  like.addEventListener('click', click);
  await start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(click).not.toHaveBeenCalled();
  expect(messages.some((m) => m.type === 'AUTO_RESULT')).toBe(false);
  document
    .querySelector('#target')!
    .insertAdjacentHTML('afterbegin', '<a href="https://www.facebook.com/123">Thời gian</a>');
  await vi.advanceTimersByTimeAsync(0);
  expect(click).toHaveBeenCalledOnce();
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
    ok: true,
    verified: true,
  });
});
it('DOM mơ hồ kéo dài thì timeout không click bài đầu tiên', async () => {
  document.body.innerHTML =
    '<main><article><div data-ad-rendering-role="like_button"></div></article><article><div data-ad-rendering-role="like_button"></div></article></main>';
  const click = vi.fn();
  document
    .querySelectorAll('[data-ad-rendering-role]')
    .forEach((b) => b.addEventListener('click', click));
  await start();
  await vi.advanceTimersByTimeAsync(20000);
  expect(click).not.toHaveBeenCalled();
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({ ok: false });
});
it('bài đã click bị thay thế không lấy trạng thái Like của bài khác để báo thành công', async () => {
  document.body.innerHTML =
    '<main><article><div data-ad-rendering-role="like_button"></div></article></main>';
  document.querySelector('[data-ad-rendering-role]')!.addEventListener('click', () => {
    document.querySelector('main')!.innerHTML =
      '<article><div data-ad-rendering-role="like_button" aria-pressed="true"></div></article>';
  });
  await start();
  await vi.advanceTimersByTimeAsync(20000);
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({ ok: false });
});

it.each(['Đã thích', 'Liked', 'Bỏ thích', 'Remove Like'])(
  'nhận trạng thái %s ở nội dung con dù aria-label vẫn là Thích',
  async (label) => {
    document.body.innerHTML =
      '<main><button aria-label="Thích"><div data-ad-rendering-role="like_button"></div><span>Thích</span></button></main>';
    const button = document.querySelector('button')!;
    const click = vi.fn(() => {
      button.querySelector('span')!.textContent = label;
    });
    button.addEventListener('click', click);
    await start();
    expect(click).toHaveBeenCalledOnce();
    expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
      ok: true,
      verified: true,
    });
  },
);
it('DOM bài viết render lại có permalink đúng thì nhận kết quả, không click lại', async () => {
  document.body.innerHTML =
    '<main><article><a href="https://www.facebook.com/123">Post</a><button>Thích</button></article></main>';
  const click = vi.fn(() => {
    document.querySelector('main')!.innerHTML =
      '<article><a href="https://www.facebook.com/123">Post</a><button>Đã thích</button></article>';
  });
  document.querySelector('button')!.addEventListener('click', click);
  await start();
  expect(click).toHaveBeenCalledOnce();
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
    ok: true,
    verified: true,
  });
});
it('Follow VIP tải xong thiếu nút trả kết quả bỏ qua ngay', async () => {
  const followTask = { ...task, page: 'subcheofbvip', kind: 'FOLLOW' };
  document.body.innerHTML = '<main><h1>Trang cá nhân</h1></main>';
  listener(
    {
      type: 'AUTO_STEP',
      operation: state.operation,
      task: followTask,
      config: state.settings.adapters.subcheofbvip,
    },
    { id: 'extension' },
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
    ok: true,
    verified: false,
    skipped: 'missing-follow-control',
  });
});
it('Follow VIP đã theo dõi không click để tránh hủy theo dõi', async () => {
  document.body.innerHTML = '<main><button>Đang theo dõi</button></main>';
  const click = vi.fn();
  document.querySelector('button')!.addEventListener('click', click);
  listener(
    {
      type: 'AUTO_STEP',
      operation: state.operation,
      task: { ...task, page: 'subcheofbvip', kind: 'FOLLOW' },
      config: state.settings.adapters.subcheofbvip,
    },
    { id: 'extension' },
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(click).not.toHaveBeenCalled();
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
    ok: true,
    verified: true,
  });
});

it('Follow VIP chờ load thực sự rồi bỏ qua ngay, không cần timer tìm nút', async () => {
  let ready: DocumentReadyState = 'loading';
  vi.spyOn(document, 'readyState', 'get').mockImplementation(() => ready);
  document.body.innerHTML = '<main>Trang cá nhân</main>';
  listener(
    {
      type: 'AUTO_STEP',
      operation: state.operation,
      task: { ...task, page: 'subcheofbvip', kind: 'FOLLOW' },
      config: state.settings.adapters.subcheofbvip,
    },
    { id: 'extension' },
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(messages.some((m) => m.type === 'AUTO_RESULT')).toBe(false);
  ready = 'complete';
  document.dispatchEvent(new Event('readystatechange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(messages.find((m) => m.type === 'AUTO_RESULT')).toMatchObject({
    ok: true,
    skipped: 'missing-follow-control',
  });
});
