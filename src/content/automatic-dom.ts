import { interactive, visible } from './detection';
import { sameFacebookTarget } from '../utils/url';
import type { AdapterConfig, Task } from '../types';
export const controlSelector = 'button,a,[role="button"],input[type="button"],input[type="submit"]';
export const likeMarkerSelector = '[data-ad-rendering-role="like_button"]';
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
      [...el.querySelectorAll<HTMLAnchorElement>('a[href]')].some((a) =>
        sameFacebookTarget(a.href, task.url),
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
  const candidates = new Map<HTMLElement, boolean>();
  for (const el of actions) candidates.set(el, el.getAttribute('aria-pressed') === 'true');
  for (const el of done) candidates.set(el, true);
  if (kind === 'LIKE') {
    for (const marker of root.querySelectorAll<HTMLElement>(likeMarkerSelector)) {
      // Facebook can use an empty marker inside the actual clickable control.
      // Its own rectangle may be empty; use the associated visible button instead.
      if (marker.closest('[hidden],[inert],[aria-hidden="true"],[disabled],[aria-disabled="true"]'))
        continue;
      const style = getComputedStyle(marker);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        continue;
      const ancestor = marker.closest<HTMLElement>(controlSelector);
      let button: HTMLElement | undefined;
      if (ancestor && (!(root instanceof Node) || !root.contains(ancestor))) continue;
      if (ancestor && root instanceof Node && root.contains(ancestor)) {
        if (interactive(ancestor)) button = ancestor;
      } else {
        const children = [...marker.querySelectorAll<HTMLElement>(controlSelector)].filter(
          interactive,
        );
        if (children.length > 1)
          throw Error('Nhiều nút trong vùng Like; không xác định được nút cần bấm.');
        button = children[0] || (interactive(marker) ? marker : undefined);
      }
      if (!button) continue;
      const alreadyLiked =
        candidates.get(button) === true ||
        button.getAttribute('aria-pressed') === 'true' ||
        marker.getAttribute('aria-pressed') === 'true' ||
        ['bỏ thích', 'unlike'].includes(labelOf(button)) ||
        ['bỏ thích', 'unlike'].includes(labelOf(marker));
      candidates.set(button, alreadyLiked);
    }
  }
  if (candidates.size > 1) throw Error('Nhiều nút tương tác phù hợp; dừng để tránh bấm nhầm.');
  const candidate = candidates.entries().next().value;
  return candidate ? { button: candidate[0], done: candidate[1] } : null;
}
export function successSignals(
  doc: Document,
  config: AdapterConfig,
): { element: HTMLElement; text: string }[] {
  const explicit = config.rewardSuccessSelector;
  const elements = explicit
    ? [...doc.querySelectorAll<HTMLElement>(explicit)]
    : [...doc.querySelectorAll<HTMLElement>('[role="alert"],.alert,.toast,.swal2-html-container')];
  return elements
    .filter(visible)
    .map((el) => ({ element: el, text: (el.textContent || '').trim() }))
    .filter(
      ({ text }) =>
        text &&
        (explicit || /nhận(?:\s+\S+){0,6}\s+thành công|đã\s+cộng|cộng\s+[\d.,]+\s*xu/i.test(text)),
    );
}
export function successMessages(doc: Document, config: AdapterConfig): string[] {
  return successSignals(doc, config).map((signal) => signal.text);
}
