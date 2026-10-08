import type { PageId, Settings, State } from '../types';
export const pages: PageId[] = ['likepostvipcheo', 'likepostvipre', 'subcheo', 'subcheofbvip'];
export const pageUrl = (id: PageId) => `https://tuongtaccheo.com/kiemtien/${id}/`;
export function pageFromUrl(raw: string): PageId | undefined {
  try {
    const u = new URL(raw);
    return u.origin === 'https://tuongtaccheo.com'
      ? pages.find((p) => u.pathname === `/kiemtien/${p}/`)
      : undefined;
  } catch {
    return undefined;
  }
}
export function defaultSettings(): Settings {
  return {
    delaySeconds: 5,
    order: [...pages],
    enabled: Object.fromEntries(pages.map((p) => [p, true])) as Settings['enabled'],
    adapters: Object.fromEntries(
      pages.map((p) => [
        p,
        {
          taskSelector: '.btn.btn-default',
          containerSelector: '',
          urlAttribute: '',
          individualRewardSelector: '',
          emptySelector: '',
        },
      ]),
    ) as Settings['adapters'],
  };
}
export function initialState(): State {
  return {
    version: 1,
    running: false,
    phase: 'STOPPED',
    currentPageIndex: 0,
    currentTaskId: null,
    completedTasks: [],
    skippedTasks: [],
    tasks: [],
    settings: defaultSettings(),
    activityLogs: [],
    lastTransitionTime: 0,
    originTabId: null,
    taskTabs: {},
    dueAt: null,
    emptyRetryAt: null,
    emptyRetryCount: 0,
    loadDeadline: null,
    error: null,
    rewardTaskId: null,
    batchRewardConfirmed: false,
    emptyVisits: 0,
    scanToken: null,
  };
}
export function validateSettings(s: Settings) {
  if (
    !s ||
    !Number.isFinite(s.delaySeconds) ||
    s.delaySeconds < 5 ||
    s.delaySeconds > 3600 ||
    s.order.length !== 4 ||
    new Set(s.order).size !== 4 ||
    !s.order.every((p) => pages.includes(p)) ||
    !pages.some((p) => s.enabled[p])
  )
    throw Error('Khoảng chờ 5–3600 giây; thứ tự phải đủ 4 trang và bật ít nhất một trang.');
  for (const p of pages) {
    if (
      typeof s.enabled[p] !== 'boolean' ||
      !s.adapters[p] ||
      Object.values(s.adapters[p]).some((v) => typeof v !== 'string' || v.length > 500)
    )
      throw Error('Cấu hình adapter không hợp lệ.');
  }
}
