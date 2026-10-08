// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import fixture from './fixtures/tasks.html?raw';
import { detect, rewardElements, loginRequired, scanDiagnostic } from '../src/content/detection';
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

import { emptyListVisible, reloadListButton } from '../src/content/empty-list';
it('nhận diện thông báo hết nhiệm vụ đang hiển thị', () => {
  document.body.innerHTML = '<div hidden>Chưa có thêm nhiệm vụ</div>';
  expect(emptyListVisible(document, c)).toBe(false);
  document.body.innerHTML = '<div>Chưa có thêm nhiệm vụ, hãy đợi một chút!</div>';
  expect(emptyListVisible(document, c)).toBe(true);
});
it('chỉ chọn nút tải lại rõ ràng, không chọn nút nhiệm vụ hoặc nhận xu', () => {
  document.body.innerHTML =
    '<button>Nhận tất cả xu</button><button>Like</button><button id="reload">Tải lại danh sách</button>';
  expect(reloadListButton(document).id).toBe('reload');
  document.querySelector('#reload')!.remove();
  expect(() => reloadListButton(document)).toThrow();
  document.body.innerHTML = '<button>Tải lại</button><button>Tải lại danh sách</button>';
  expect(() => reloadListButton(document)).toThrow('Có nhiều');
});

it('nhận biết trang Follow VIP yêu cầu đăng nhập dù không có ô mật khẩu', () => {
  document.body.innerHTML =
    '<h4>HÃY ĐĂNG NHẬP ĐỂ SỬ DỤNG</h4><p><a href="https://tuongtaccheo.com/">Đăng nhập ngay</a></p>';
  expect(loginRequired(document)).toBe(true);
});
it('không báo chưa đăng nhập chỉ vì có liên kết đăng nhập hoặc thông báo ẩn', () => {
  document.body.innerHTML = '<a>Đăng nhập</a><div hidden><h4>HÃY ĐĂNG NHẬP ĐỂ SỬ DỤNG</h4></div>';
  expect(loginRequired(document)).toBe(false);
});
it('chẩn đoán riêng selector không khớp và nút thiếu URL', () => {
  document.body.innerHTML = '';
  expect(scanDiagnostic(document, c)).toContain('Không tìm thấy nút khớp selector');
  document.body.innerHTML = '<button class="btn btn-default">Follow</button>';
  expect(scanDiagnostic(document, c)).toContain('chưa trích xuất được URL');
  document.querySelector('button')!.disabled = true;
  expect(scanDiagnostic(document, c)).toContain('chưa có nút hiển thị và tương tác');
});

it('Follow VIP nhận nút không URL, giữ ID khi đổi thứ tự và loại nút thưởng', () => {
  document.body.innerHTML =
    '<button class="btn btn-default" onclick="follow(123)"></button><button class="btn btn-default">Nhận tất cả xu</button><button class="btn btn-default">Tải lại danh sách</button>';
  const first = detect(document, 'subcheofbvip', c);
  expect(first).toHaveLength(1);
  expect(first[0].url).toBe('');
  document.body.append(document.querySelector('button')!);
  expect(detect(document, 'subcheofbvip', c)[0].id).toBe(first[0].id);
  expect(detect(document, 'subcheo', c)).toHaveLength(0);
});
