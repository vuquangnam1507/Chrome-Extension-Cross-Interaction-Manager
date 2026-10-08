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
export class FacebookScopeError extends Error {}
const articleSelector = 'article,[role="article"]';
const likeNames = ['thích', 'like', 'thích bài viết', 'like this post'];
const likedNames = ['bỏ thích', 'unlike', 'đã thích', 'liked', 'gỡ thích', 'remove like'];
const normalizeLabel = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
// Read independent semantic signals: aria-label can remain "Like" while the
// visible label or a descendant control changes. Never infer success from color/count.
function explicitlyLiked(button: HTMLElement): boolean {
  const nodes = [
    button,
    ...button.querySelectorAll<HTMLElement>('[aria-pressed],[aria-label],[title],span'),
  ];
  return nodes.some((node) => {
    if (node !== button && node.closest(controlSelector) !== button) return false;
    if (node.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    if (!visible(node)) return false;
    return (
      node.getAttribute('aria-pressed') === 'true' ||
      [node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent].some(
        (value) => value != null && likedNames.includes(normalizeLabel(value)),
      )
    );
  });
}

// Descendant articles are usually comments, quoted posts or recommendations.
// Their controls are not controls of the resolved post itself.
function ownedBy(root: ParentNode, el: HTMLElement): boolean {
  if (!(root instanceof HTMLElement)) return true;
  const owner = el.closest(articleSelector);
  if (owner && owner !== root && root.contains(owner)) return false;
  const secondary = el.closest('aside,[role="complementary"],[role="navigation"],[role="feed"]');
  return !secondary || secondary === root || !root.contains(secondary);
}
function markerControls(root: ParentNode): Map<HTMLElement, boolean> {
  const found = new Map<HTMLElement, boolean>();
  for (const marker of root.querySelectorAll<HTMLElement>(likeMarkerSelector)) {
    if (
      !ownedBy(root, marker) ||
      marker.closest('[hidden],[inert],[aria-hidden="true"],[disabled],[aria-disabled="true"]')
    )
      continue;
    const style = getComputedStyle(marker);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      continue;
    const ancestor = marker.closest<HTMLElement>(controlSelector);
    if (ancestor && (!(root instanceof Node) || !root.contains(ancestor))) continue;
    let button: HTMLElement | undefined;
    if (ancestor) {
      if (interactive(ancestor)) button = ancestor;
    } else {
      const children = [...marker.querySelectorAll<HTMLElement>(controlSelector)].filter(
        interactive,
      );
      if (children.length > 1)
        throw new FacebookScopeError('Nhiều nút trong vùng Like; chưa xác định được nút cần bấm.');
      button = children[0] || (interactive(marker) ? marker : undefined);
    }
    if (!button || !ownedBy(root, button)) continue;
    found.set(button, explicitlyLiked(button) || explicitlyLiked(marker));
  }
  return found;
}
function leafRegions(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((el) => !elements.some((other) => other !== el && el.contains(other)));
}
function postLinkMatches(link: HTMLAnchorElement, urls: string[]): boolean {
  if (!visible(link)) return false;
  try {
    const url = new URL(link.href);
    // A comment permalink points at the same post but must not select the comment.
    if (url.searchParams.has('comment_id') || url.searchParams.has('reply_comment_id'))
      return false;
    return urls.some((target) => sameFacebookTarget(link.href, target));
  } catch {
    return false;
  }
}
export function facebookScope(
  doc: Document,
  task: Task,
  config: AdapterConfig,
  verifiedDocumentUrl?: string,
  requirePermalink = false,
): ParentNode {
  if (config.facebookScopeSelector && !requirePermalink) {
    const roots = [...doc.querySelectorAll<HTMLElement>(config.facebookScopeSelector)].filter(
      visible,
    );
    if (roots.length !== 1)
      throw new FacebookScopeError('Scope Facebook phải khớp đúng một vùng hiển thị.');
    return roots[0];
  }
  const mains = leafRegions(
    [...doc.querySelectorAll<HTMLElement>('main,[role="main"]')].filter(visible),
  );
  if (task.kind !== 'LIKE') {
    if (mains.length === 1) return mains[0];
    throw new FacebookScopeError('Chưa nhận diện được vùng nội dung Facebook.');
  }
  const targets = [task.url, ...(verifiedDocumentUrl ? [verifiedDocumentUrl] : [])];
  const dialogs = leafRegions(
    [...doc.querySelectorAll<HTMLElement>('[role="dialog"],[aria-modal="true"]')].filter(
      (el) =>
        visible(el) &&
        ([...el.querySelectorAll<HTMLElement>(likeMarkerSelector)].some(
          (marker) => !marker.closest('[hidden],[inert],[aria-hidden="true"]'),
        ) ||
          controls(el, [...likeNames, ...likedNames]).length > 0),
    ),
  );
  const regions: ParentNode[] = dialogs.length ? dialogs : mains.length ? mains : [doc];
  const owners = new Set<HTMLElement>();
  for (const region of regions) {
    for (const link of region.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (!postLinkMatches(link, targets)) continue;
      let owner = link.closest<HTMLElement>(articleSelector);
      if (owner && markerControls(owner).size === 0) {
        let parent = owner.parentElement?.closest<HTMLElement>(articleSelector);
        while (parent && region instanceof Node && region.contains(parent)) {
          if (markerControls(parent).size > 0) {
            owner = parent;
            break;
          }
          parent = parent.parentElement?.closest<HTMLElement>(articleSelector);
        }
      }
      if (owner && visible(owner) && region instanceof Node && region.contains(owner))
        owners.add(owner);
    }
  }
  if (owners.size === 1) return [...owners][0];
  if (owners.size > 1) {
    const withMarker = [...owners].filter((owner) => markerControls(owner).size > 0);
    if (withMarker.length === 1) return withMarker[0];
    throw new FacebookScopeError(
      'Nhiều vùng có liên kết bài viết đích; đang chờ DOM phân biệt rõ.',
    );
  }
  if (requirePermalink)
    throw new FacebookScopeError('DOM đã thay thế; chờ permalink xác nhận đúng bài viết đích.');
  const articles = [
    ...new Set(
      regions.flatMap((region) =>
        [...region.querySelectorAll<HTMLElement>(articleSelector)].filter(visible),
      ),
    ),
  ];
  const primaryArticles = articles.filter((article) => {
    const secondary = article.closest(
      'aside,[role="complementary"],[role="navigation"],[role="feed"]',
    );
    return (
      !secondary ||
      !regions.some(
        (region) => region instanceof Node && region !== secondary && region.contains(secondary),
      )
    );
  });
  // Use the page-level Like marker when article nodes only describe its comments.
  // The document URL has already been verified against the workflow tab by the runtime guard.
  if (verifiedDocumentUrl && regions.length === 1 && regions[0] instanceof HTMLElement) {
    const primary = markerControls(regions[0]);
    if (primary.size === 1) return regions[0];
    if (primary.size > 1)
      throw new FacebookScopeError('Có nhiều nút Like chính; đang chờ xác định bài viết đích.');
    const markedArticles = primaryArticles.filter((article) => markerControls(article).size > 0);
    if (markedArticles.length === 1) return markedArticles[0];
  }
  const topLevel = primaryArticles.filter(
    (article) => !primaryArticles.some((other) => other !== article && other.contains(article)),
  );
  if (topLevel.length === 1) return topLevel[0];
  if (topLevel.length > 1)
    throw new FacebookScopeError(
      'Có nhiều bài viết chưa có permalink hoặc marker duy nhất của bài đích; đang chờ DOM hoàn tất.',
    );
  if (regions.length === 1 && regions[0] instanceof HTMLElement) return regions[0];
  throw new FacebookScopeError('Chưa nhận diện được vùng nội dung Facebook.');
}
export function socialControl(
  root: ParentNode,
  kind: Task['kind'],
): { button: HTMLElement; done: boolean } | null {
  const markerCandidates = kind === 'LIKE' ? markerControls(root) : new Map<HTMLElement, boolean>();
  // Markers identify the post action more precisely than generic Like text on comments.
  const candidates = new Map<HTMLElement, boolean>(markerCandidates);
  if (!candidates.size) {
    const actions = controls(root, kind === 'LIKE' ? likeNames : ['theo dõi', 'follow']);
    const done = controls(root, kind === 'LIKE' ? likedNames : ['đang theo dõi', 'following']);
    for (const el of actions)
      if (kind !== 'LIKE' || ownedBy(root, el))
        candidates.set(
          el,
          kind === 'LIKE' ? explicitlyLiked(el) : el.getAttribute('aria-pressed') === 'true',
        );
    for (const el of done) if (kind !== 'LIKE' || ownedBy(root, el)) candidates.set(el, true);
  }
  if (candidates.size > 1)
    throw new FacebookScopeError(
      'Nhiều nút tương tác phù hợp; đang chờ xác định đúng nút của bài viết.',
    );
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
