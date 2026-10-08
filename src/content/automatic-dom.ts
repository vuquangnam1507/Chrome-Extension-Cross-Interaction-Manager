import { interactive, visible } from './detection';
import { facebookUrl } from '../utils/url';
import type { AdapterConfig, Task } from '../types';
export const controlSelector = 'button,a,[role="button"],input[type="button"],input[type="submit"]';
export const labelOf = (el: HTMLElement) =>
  (
    el.getAttribute('aria-label') ||
    (el instanceof HTMLInputElement ? el.value : el.textContent) ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
export function controls(root: ParentNode, labels: string[]) {
  return [...root.querySelectorAll<HTMLElement>(controlSelector)].filter(
    (el) => interactive(el) && labels.includes(labelOf(el)),
  );
}
export function facebookScope(doc: Document, task: Task, config: AdapterConfig): ParentNode {
  if (config.facebookScopeSelector) {
    const roots = [...doc.querySelectorAll<HTMLElement>(config.facebookScopeSelector)].filter(
      visible,
    );
    if (roots.length !== 1) throw Error('Scope Facebook phải khớp đúng một vùng hiển thị.');
    return roots[0];
  }
  if (task.kind === 'LIKE') {
    const articles = [...doc.querySelectorAll<HTMLElement>('article,[role="article"]')].filter(
      visible,
    );
    const matches = articles.filter((el) =>
      [...el.querySelectorAll<HTMLAnchorElement>('a[href]')].some(
        (a) => facebookUrl(a.href) === task.url,
      ),
    );
    if (matches.length === 1) return matches[0];
    if (articles.length === 1) return articles[0];
    if (articles.length > 1)
      throw Error('Có nhiều bài viết; chưa xác định chắc bài viết của công việc.');
  }
  const mains = [...doc.querySelectorAll<HTMLElement>('main,[role="main"]')].filter(visible);
  if (mains.length === 1) return mains[0];
  throw Error('Chưa nhận diện được vùng nội dung Facebook.');
}
export function socialControl(
  root: ParentNode,
  kind: Task['kind'],
): { button: HTMLElement; done: boolean } | null {
  const actions = controls(
    root,
    kind === 'LIKE'
      ? ['thích', 'like', 'thích bài viết', 'like this post']
      : ['theo dõi', 'follow'],
  );
  const done = controls(
    root,
    kind === 'LIKE' ? ['bỏ thích', 'unlike'] : ['đang theo dõi', 'following'],
  );
  const pressed = actions.filter((el) => el.getAttribute('aria-pressed') === 'true');
  const available = actions.filter((el) => el.getAttribute('aria-pressed') !== 'true');
  if (done.length + pressed.length + available.length > 1)
    throw Error('Nhiều nút tương tác phù hợp; dừng để tránh bấm nhầm.');
  const completed = done[0] || pressed[0];
  return completed
    ? { button: completed, done: true }
    : available[0]
      ? { button: available[0], done: false }
      : null;
}
export function successMessages(doc: Document, config: AdapterConfig): string[] {
  const explicit = config.rewardSuccessSelector;
  const elements = explicit
    ? [...doc.querySelectorAll<HTMLElement>(explicit)]
    : [...doc.querySelectorAll<HTMLElement>('[role="alert"],.alert,.toast,.swal2-html-container')];
  return elements
    .filter(visible)
    .map((el) => (el.textContent || '').trim())
    .filter(
      (text) =>
        text &&
        (explicit || /nhận(?:\s+\S+){0,6}\s+thành công|đã\s+cộng|cộng\s+[\d.,]+\s*xu/i.test(text)),
    );
}
