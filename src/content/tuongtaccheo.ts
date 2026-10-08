import { pageFromUrl } from '../config/pages';
import type { AdapterConfig, PageId, Task, Scan } from '../types';
import { interactive, visible, rewardElements } from './detection';
import { modules } from '../modules';
let readyAt = 0;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let observer: MutationObserver | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let context: { page: PageId; token: string; config: AdapterConfig } | undefined;
let last = '';
const cache = new Map<HTMLElement, Task[]>();
const dirty = new Set<HTMLElement>();
function send(value: unknown) {
  void chrome.runtime.sendMessage(value).catch(() => {});
}
function emit(full = false) {
  if (!context) return;
  const { page, token, config } = context;
  try {
    if (full) {
      cache.clear();
      for (const el of document.querySelectorAll<HTMLElement>(config.taskSelector))
        cache.set(el, []);
    } else {
      for (const root of dirty) {
        if (root.matches(config.taskSelector)) cache.set(root, []);
        for (const el of root.querySelectorAll<HTMLElement>(config.taskSelector)) cache.set(el, []);
      }
      dirty.clear();
    }
    for (const [el] of cache) {
      if (!el.isConnected) {
        cache.delete(el);
        continue;
      }
      cache.set(
        el,
        interactive(el) ? [modules[page].detect(el, config)].filter((t): t is Task => !!t) : [],
      );
    }
    const tasks = [...new Map([...cache.values()].flat().map((t) => [t.id, t])).values()];
    let status: Scan['status'] = tasks.length ? 'ok' : 'unknown';
    let detail =
      'Không nhận diện được công việc. Kiểm tra đăng nhập, selector và URL trong adapter; không tự coi là hết việc.';
    if (!navigator.onLine) status = 'offline';
    else if ([...document.querySelectorAll<HTMLElement>('input[type="password"]')].some(visible))
      status = 'login';
    else if (
      !tasks.length &&
      config.emptySelector &&
      [...document.querySelectorAll<HTMLElement>(config.emptySelector)].some(visible)
    )
      status = 'empty';
    if (status === 'unknown' && Date.now() < readyAt) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => emit(true), readyAt - Date.now());
      return;
    }
    const signature = JSON.stringify({ tasks, status });
    if (full || signature !== last) {
      last = signature;
      send({ type: 'SCAN', page, token, tasks, status, detail });
    }
  } catch (e) {
    send({
      type: 'SCAN',
      page,
      token,
      tasks: [],
      status: 'unknown',
      detail: `Adapter không hợp lệ: ${String(e)}`,
    });
  }
}
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m.type === 'SCAN_REQUEST') {
    if (pageFromUrl(location.href) !== m.page) {
      reply({ ok: false });
      return;
    }
    observer?.disconnect();
    clearTimeout(timer);
    context = m;
    readyAt = Date.now() + 4000;
    clearTimeout(settleTimer);
    cache.clear();
    dirty.clear();
    last = '';
    emit(true);
    observer = new MutationObserver((records) => {
      for (const r of records) {
        const target = r.target instanceof HTMLElement ? r.target : r.target.parentElement;
        if (target) dirty.add(target);
      }
      clearTimeout(timer);
      timer = setTimeout(() => emit(), 300);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
      attributeFilter: [
        'class',
        'style',
        'hidden',
        'disabled',
        'aria-disabled',
        'href',
        'data-url',
        'title',
        ...(m.config.urlAttribute ? [m.config.urlAttribute] : []),
      ],
    });
    reply({ ok: true });
  } else if (m.type === 'HIGHLIGHT') {
    try {
      if (pageFromUrl(location.href) !== m.page) throw Error('Tab gốc đã đổi trang.');
      const found = rewardElements(document, m.batch, m.config, m.taskId, m.page);
      if (found.length !== 1)
        throw Error(
          found.length
            ? 'Có nhiều nút phù hợp; cần cấu hình chính xác hơn.'
            : 'Chưa tìm thấy nút nhận thưởng. Với thưởng lẻ, cần container và selector từ HTML thực tế.',
        );
      const el = found[0];
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const previous = el.style.outline;
      el.style.outline = '4px solid #e99c24';
      setTimeout(() => {
        el.style.outline = previous;
      }, 7000);
      reply({ ok: true });
    } catch (e) {
      reply({ ok: false, error: String(e) });
    }
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.state?.newValue?.running === false) {
    observer?.disconnect();
    clearTimeout(timer);
    context = undefined;
    clearTimeout(settleTimer);
    cache.clear();
  }
});
window.addEventListener('offline', () => emit(true));
window.addEventListener('online', () => emit(true));
send({ type: 'READY' });
