import type { PageId, AdapterConfig, Task } from '../types';
import { facebookUrl } from '../utils/url';
export interface PageModule {
  id: PageId;
  kind: Task['kind'];
  rewardMode: 'individual' | 'batch';
  detect: (el: HTMLElement, config: AdapterConfig) => Task | null;
}
export function makeModule(
  id: PageId,
  kind: Task['kind'],
  rewardMode: PageModule['rewardMode'],
): PageModule {
  return {
    id,
    kind,
    rewardMode,
    detect(el, c) {
      const label = (el.textContent || '').trim();
      if (/nhận.*xu|nhận.*thưởng|đăng nhập|tải lại|bỏ qua/i.test(label)) return null;
      const context = c.containerSelector ? el.closest(c.containerSelector) : el;
      const raw = [
        el.getAttribute('href'),
        c.urlAttribute ? el.getAttribute(c.urlAttribute) : null,
        el.getAttribute('data-url'),
        // Observed task buttons expose a quoted Facebook URL in title.
        // Read it as data only; never execute the inline onclick handler.
        el.getAttribute('title'),
        context?.querySelector('a[href*="facebook.com"]')?.getAttribute('href'),
      ];
      const url = raw
        .map((value) => {
          if (!value) return null;
          const trimmed = value.trim();
          const quoted =
            (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'));
          return facebookUrl(quoted ? trimmed.slice(1, -1).trim() : trimmed);
        })
        .find(Boolean);
      if (!url) return null;
      return { id: `${id}:${url}`, page: id, kind, url, label: label.slice(0, 160) || kind };
    },
  };
}
