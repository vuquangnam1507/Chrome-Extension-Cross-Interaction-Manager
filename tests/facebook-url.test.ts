import { it, expect } from 'vitest';
import { sameFacebookTarget, matchesFacebookOperation } from '../src/utils/url';
it.each([
  ['https://www.facebook.com/123', 'https://m.facebook.com/123/?rdid=abc&ref=job'],
  ['https://www.facebook.com/123', 'https://www.facebook.com/story.php?story_fbid=123&id=999'],
  ['https://www.facebook.com/123', 'https://www.facebook.com/person/posts/123/?locale=vi_VN'],
  ['https://www.facebook.com/profile.php?id=123', 'https://www.facebook.com/123/'],
  [
    'https://www.facebook.com/photo.php?fbid=123',
    'https://www.facebook.com/photo/?fbid=123&set=a.456',
  ],
])('cùng đối tượng Facebook: %s và %s', (a, b) => expect(sameFacebookTarget(a, b)).toBe(true));
it.each([
  ['https://www.facebook.com/123', 'https://www.facebook.com/999'],
  ['https://www.facebook.com/123', 'https://www.facebook.com/story.php?story_fbid=999&id=123'],
  ['https://www.facebook.com/123', 'https://evil.example/123'],
  ['https://www.facebook.com/123', 'https://www.facebook.com/login.php'],
])('không đánh đồng đối tượng: %s và %s', (a, b) => expect(sameFacebookTarget(a, b)).toBe(false));
it('URL redirect chỉ được chấp nhận khi có URL tài liệu đã xác minh trong operation', () => {
  const alias = 'https://www.facebook.com/person/posts/pfbidABC';
  expect(matchesFacebookOperation(alias, 'https://www.facebook.com/123')).toBe(false);
  expect(matchesFacebookOperation(alias, 'https://www.facebook.com/123', alias)).toBe(true);
  expect(
    matchesFacebookOperation('https://www.facebook.com/999', 'https://www.facebook.com/123', alias),
  ).toBe(false);
});

it('permalink đã xác minh vẫn là cùng bài khi Facebook đổi tracking, hash, hostname và dấu slash', () => {
  expect(
    matchesFacebookOperation(
      'https://m.facebook.com/person/posts/pfbidABC/?rdid=new&locale=vi_VN#comments',
      'https://www.facebook.com/123',
      'https://www.facebook.com/person/posts/pfbidABC',
    ),
  ).toBe(true);
  expect(
    matchesFacebookOperation(
      'https://www.facebook.com/person/posts/pfbidOTHER',
      'https://www.facebook.com/123',
      'https://www.facebook.com/person/posts/pfbidABC',
    ),
  ).toBe(false);
});
