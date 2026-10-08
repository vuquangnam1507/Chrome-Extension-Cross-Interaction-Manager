// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { facebookScope, socialControl, successMessages } from '../src/content/automatic-dom';
import { defaultSettings } from '../src/config/pages';
import { waitFor } from '../src/content/automatic-runtime';
import type { Task } from '../src/types';
const task: Task = {
  id: 'likepostvipcheo:https://www.facebook.com/123',
  page: 'likepostvipcheo',
  kind: 'LIKE',
  url: 'https://www.facebook.com/123',
  label: 'Like',
};
const config = defaultSettings().adapters.likepostvipcheo;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 1, height: 1 },
  ] as unknown as DOMRectList);
});
afterEach(() => vi.restoreAllMocks());
it('phân biệt Like chưa bấm với trạng thái đã thích', () => {
  document.body.innerHTML =
    '<main><button aria-label="Thích" aria-pressed="false"></button></main>';
  expect(socialControl(facebookScope(document, task, config), 'LIKE')?.done).toBe(false);
  document.querySelector('button')!.setAttribute('aria-pressed', 'true');
  expect(socialControl(facebookScope(document, task, config), 'LIKE')?.done).toBe(true);
});
it('Follow dùng trạng thái Đang theo dõi thay vì click lại', () => {
  document.body.innerHTML = '<main><button>Đang theo dõi</button></main>';
  expect(socialControl(document, 'FOLLOW')?.done).toBe(true);
});
it('nhiều nút Like không chọn bừa nút đầu tiên', () => {
  document.body.innerHTML = '<main><button>Thích</button><button>Thích</button></main>';
  expect(() => socialControl(document, 'LIKE')).toThrow('Nhiều');
});
it('phạm vi bài viết dựa vào permalink của công việc', () => {
  document.body.innerHTML =
    '<article><a href="https://www.facebook.com/123">bài cần làm</a><button>Thích</button></article><article><button>Thích</button></article>';
  const scope = facebookScope(document, task, config);
  expect(scope).toBe(document.querySelector('article'));
  expect(socialControl(scope, 'LIKE')?.done).toBe(false);
});
it('không tìm được bài chính xác khi có nhiều bài thì báo lỗi', () => {
  document.body.innerHTML =
    '<article><button>Thích</button></article><article><button>Thích</button></article>';
  expect(() => facebookScope(document, task, config)).toThrow('nhiều bài viết');
});
it('nhận thưởng cần thông báo thành công hiển thị; ẩn hay lỗi không tính', () => {
  document.body.innerHTML =
    '<div role="alert" hidden>Nhận xu thành công</div><div role="alert">Lỗi không có xu</div>';
  expect(successMessages(document, config)).toEqual([]);
  document.querySelector('[hidden]')!.removeAttribute('hidden');
  expect(successMessages(document, config)).toEqual(['Nhận xu thành công']);
});
it('MutationObserver đợi kết quả và Stop hủy ngay', async () => {
  document.body.innerHTML = '<div id="result"></div>';
  const controller = new AbortController();
  const pending = waitFor(
    () => document.querySelector('#result')!.textContent || null,
    controller.signal,
  );
  document.querySelector('#result')!.textContent = 'done';
  await expect(pending).resolves.toBe('done');
  const next = waitFor(() => null, controller.signal);
  controller.abort();
  await expect(next).rejects.toThrow('hủy');
});
