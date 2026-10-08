// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import fixture from './fixtures/tasks.html?raw';
import { detect, rewardElements } from '../src/content/detection';
import { defaultSettings } from '../src/config/pages';
import { facebookUrl } from '../src/utils/url';
import { modules } from '../src/modules';
beforeEach(() => {
  document.body.innerHTML = fixture;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 20, height: 20 },
  ] as unknown as DOMRectList);
});
const c = {
  ...defaultSettings().adapters.likepostvipcheo,
  containerSelector: '.job',
  individualRewardSelector: '.reward',
};
describe('DOM adapter', () => {
  it('chỉ lấy công việc hiển thị, tương tác được; loại URL sai và nút chức năng', () => {
    const tasks = detect(document, 'likepostvipcheo', c);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].url).toBe('https://www.facebook.com/story.php?id=200&story_fbid=100');
  });
  it('mã định danh ổn định và loại công việc theo module', () => {
    const a = detect(document, 'subcheofbvip', c);
    expect(a[0].kind).toBe('FOLLOW');
    expect(a[0].id).toBe(`subcheofbvip:${a[0].url}`);
  });
  it('không bịa selector thưởng lẻ', () => {
    expect(
      rewardElements(document, false, defaultSettings().adapters.subcheo, null, 'subcheo'),
    ).toEqual([]);
  });
  it('phân biệt thưởng lẻ theo container và thưởng nhóm theo nội dung', () => {
    const task = detect(document, 'likepostvipcheo', c)[0];
    expect(rewardElements(document, false, c, task.id, 'likepostvipcheo')[0].className).toBe(
      'reward',
    );
    expect(rewardElements(document, true, c, null, 'subcheofbvip')[0].id).toBe('batch');
    expect(modules.subcheofbvip.rewardMode).toBe('batch');
    expect(modules.subcheo.rewardMode).toBe('individual');
  });
  it('không đánh giá javascript inline để trích xuất URL', () => {
    document.body.innerHTML = '<button class="btn btn-default" onclick="open(123)">Like</button>';
    expect(detect(document, 'likepostvipre', c)).toEqual([]);
  });
  it('chặn URL lừa đảo, đăng nhập và protocol lạ', () => {
    for (const u of [
      'javascript:alert(1)',
      'https://facebook.com.evil.test/1',
      'https://user:pass@facebook.com/1',
      'https://facebook.com/login.php',
      'http://facebook.com/1',
    ])
      expect(facebookUrl(u)).toBeNull();
  });
});

it('đọc đúng nút Like thực tế có URL bọc dấu nháy trong title mà không click', async () => {
  const { default: html } = await import('./fixtures/like-title.html?raw');
  document.body.innerHTML = html;
  const button = document.querySelector('button')!;
  const clicked = vi.fn();
  button.addEventListener('click', clicked);
  expect(detect(document, 'likepostvipcheo', c)).toEqual([
    {
      id: 'likepostvipcheo:https://www.facebook.com/1491539046359094',
      page: 'likepostvipcheo',
      kind: 'LIKE',
      url: 'https://www.facebook.com/1491539046359094',
      label: 'LIKE',
    },
  ]);
  expect(clicked).not.toHaveBeenCalled();
});
it('title hỗ trợ URL không bọc nháy hoặc bọc nháy đôi, vẫn loại trùng với href', () => {
  document.body.innerHTML =
    '<button class="btn btn-default"></button><a class="btn btn-default" href="https://facebook.com/123">Like</a>';
  for (const value of ['https://facebook.com/123', ' "https://facebook.com/123" ']) {
    document.querySelector('button')!.setAttribute('title', value);
    expect(detect(document, 'likepostvipre', c)).toHaveLength(1);
  }
});
it('title không cho phép URL giả, javascript hoặc nút nhận thưởng', () => {
  document.body.innerHTML = '<button class="btn btn-default"></button>';
  const button = document.querySelector('button')!;
  for (const value of [
    "'https://facebook.com.evil.test/123'",
    "'javascript:alert(1)'",
    "like('id','https://facebook.com/123')",
  ]) {
    button.setAttribute('title', value);
    expect(detect(document, 'likepostvipcheo', c)).toEqual([]);
  }
  button.setAttribute('title', "'https://facebook.com/123'");
  button.textContent = 'Nhận xu';
  expect(detect(document, 'likepostvipcheo', c)).toEqual([]);
});
