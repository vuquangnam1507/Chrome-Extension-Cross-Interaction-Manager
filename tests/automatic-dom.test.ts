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
it('nhận diện div Like không có text, aria-label hoặc role', () => {
  document.body.innerHTML = '<main><div data-ad-rendering-role="like_button"></div></main>';
  expect(socialControl(facebookScope(document, task, config), 'LIKE')).toEqual({
    button: document.querySelector('[data-ad-rendering-role]'),
    done: false,
  });
});
it('marker rỗng không có kích thước vẫn nhận diện nút cha có thể bấm', () => {
  document.body.innerHTML =
    '<main><div role="button" aria-label="Thích"><div data-ad-rendering-role="like_button"></div></div></main>';
  const marker = document.querySelector<HTMLElement>('[data-ad-rendering-role]')!;
  Object.defineProperty(marker, 'getClientRects', { value: () => [] });
  expect(socialControl(document, 'LIKE')?.button).toBe(document.querySelector('[role="button"]'));
});
it('label và marker cùng một nút không bị tính thành hai nút Like', () => {
  document.body.innerHTML =
    '<main><button aria-pressed="true" aria-label="Thích"><div data-ad-rendering-role="like_button"></div></button></main>';
  expect(socialControl(document, 'LIKE')).toEqual({
    button: document.querySelector('button'),
    done: true,
  });
});
it('marker bọc ngoài control thì chọn control bên trong, không click wrapper', () => {
  document.body.innerHTML =
    '<main><div data-ad-rendering-role="like_button"><button>Thích</button></div></main>';
  expect(socialControl(document, 'LIKE')?.button).toBe(document.querySelector('button'));
});
it('Like marker hidden hoặc disabled không được nhận diện', () => {
  for (const html of [
    '<div hidden data-ad-rendering-role="like_button"></div>',
    '<button disabled><div data-ad-rendering-role="like_button"></div></button>',
  ]) {
    document.body.innerHTML = html;
    expect(socialControl(document, 'LIKE')).toBeNull();
  }
});
it('hai marker Like độc lập vẫn bị chặn để không click nhầm', () => {
  document.body.innerHTML =
    '<main><div data-ad-rendering-role="like_button"></div><div data-ad-rendering-role="like_button"></div></main>';
  expect(() => socialControl(document, 'LIKE')).toThrow('Nhiều');
});
it('không lấy control ở ngoài phạm vi bài viết hoặc dùng Like marker cho Follow', () => {
  document.body.innerHTML =
    '<button><article><div data-ad-rendering-role="like_button"></div></article></button>';
  const article = document.querySelector('article')!;
  expect(socialControl(article, 'LIKE')).toBeNull();
  expect(socialControl(article, 'FOLLOW')).toBeNull();
});
it('bài chính và các article bình luận lồng nhau chỉ có một vùng bài đích', () => {
  document.body.innerHTML =
    '<main><article id="post"><div data-ad-rendering-role="like_button"></div><article><button>Thích</button></article><article><button>Thích</button></article></article></main>';
  const scope = facebookScope(document, task, config, task.url);
  expect(scope).toBe(document.querySelector('#post'));
  expect(socialControl(scope, 'LIKE')?.button).toBe(
    document.querySelector('[data-ad-rendering-role]'),
  );
});
it('bài mở trong dialog được ưu tiên hơn feed phía sau', () => {
  document.body.innerHTML =
    '<main><article><div data-ad-rendering-role="like_button"></div></article><article><div data-ad-rendering-role="like_button"></div></article></main><div role="dialog"><div id="target" data-ad-rendering-role="like_button"></div><article><button>Thích</button></article></div>';
  const scope = facebookScope(document, task, config, task.url);
  expect(scope).toBe(document.querySelector('[role="dialog"]'));
  expect(socialControl(scope, 'LIKE')?.button.id).toBe('target');
});
it('marker bài chính nằm ngoài danh sách article bình luận vẫn được chọn', () => {
  document.body.innerHTML =
    '<main><div id="target" data-ad-rendering-role="like_button"></div><article><button>Thích</button></article><article><button>Thích</button></article></main>';
  const scope = facebookScope(document, task, config, task.url);
  expect(scope).toBe(document.querySelector('main'));
  expect(socialControl(scope, 'LIKE')?.button.id).toBe('target');
});
it('giữ URL task gốc để so permalink kể cả URL tài liệu sau redirect khác dạng', () => {
  document.body.innerHTML =
    '<main><article id="target"><a href="https://www.facebook.com/123">Thời gian</a><div data-ad-rendering-role="like_button"></div></article><article><div data-ad-rendering-role="like_button"></div></article></main>';
  expect(
    facebookScope(document, task, config, 'https://www.facebook.com/user/posts/pfbidABC'),
  ).toBe(document.querySelector('#target'));
});
it('Like marker được ưu tiên hơn nhãn Like thông thường trong bình luận', () => {
  document.body.innerHTML =
    '<article><div id="target" data-ad-rendering-role="like_button"></div><div><button>Thích</button><button>Thích</button></div></article>';
  expect(socialControl(document.querySelector('article')!, 'LIKE')?.button.id).toBe('target');
});
it('bài đề xuất trong feed/sidebar không lấn át bài chính ngoài feed', () => {
  document.body.innerHTML =
    '<main><article id="target"><div data-ad-rendering-role="like_button"></div></article><div role="feed"><article><div data-ad-rendering-role="like_button"></div></article></div><aside><article><div data-ad-rendering-role="like_button"></div></article></aside></main>';
  expect(facebookScope(document, task, config, task.url)).toBe(document.querySelector('#target'));
});
it('permalink bình luận không được dùng để chọn nhầm comment làm bài đích', () => {
  document.body.innerHTML =
    '<main><article id="target"><div data-ad-rendering-role="like_button"></div><article><a href="https://www.facebook.com/123?comment_id=99">Comment</a><button>Thích</button></article></article></main>';
  expect(facebookScope(document, task, config, task.url)).toBe(document.querySelector('#target'));
});
it('hai bài thật đều có marker mà không có permalink vẫn không chọn bừa', () => {
  document.body.innerHTML =
    '<main><article><div data-ad-rendering-role="like_button"></div></article><article><div data-ad-rendering-role="like_button"></div></article></main>';
  expect(() => facebookScope(document, task, config, task.url)).toThrow('nhiều bài viết');
});

it('không coi màu xanh, số lượt thích hoặc nhãn ẩn là xác nhận Like', () => {
  document.body.innerHTML =
    '<button aria-label="Thích" style="color:blue"><div data-ad-rendering-role="like_button"></div><span hidden>Đã thích</span></button><span>10 người đã thích</span>';
  expect(socialControl(document, 'LIKE')?.done).toBe(false);
});
it('đọc title xác nhận độc lập với aria-label cũ', () => {
  document.body.innerHTML =
    '<button aria-label="Thích" title="Bỏ thích"><div data-ad-rendering-role="like_button"></div></button>';
  expect(socialControl(document, 'LIKE')?.done).toBe(true);
});
