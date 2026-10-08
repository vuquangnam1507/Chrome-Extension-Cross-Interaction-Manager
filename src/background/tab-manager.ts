import { facebookUrl } from '../utils/url';
import type { State, Task } from '../types';
export async function focus(id: number) {
  const t = await chrome.tabs.get(id);
  await chrome.windows.update(t.windowId, { focused: true });
  await chrome.tabs.update(id, { active: true });
}
export async function openTask(s: State, t: Task, cancelled: () => boolean = () => false) {
  const url = facebookUrl(t.url);
  if (!url) throw Error('URL Facebook không hợp lệ.');
  const id = s.taskTabs[t.id];
  if (id) {
    try {
      const tab = await chrome.tabs.get(id);
      if (tab.url && facebookUrl(tab.url) === url) {
        await focus(id);
        return;
      }
    } catch {
      /* tab đã đóng */
    }
    delete s.taskTabs[t.id];
  }
  if (cancelled()) return;
  const existing = (await chrome.tabs.query({ url: 'https://*.facebook.com/*' })).find(
    (tab) =>
      s.originTabId !== null &&
      tab.openerTabId === s.originTabId &&
      tab.url &&
      facebookUrl(tab.url) === url,
  );
  if (cancelled()) return;
  if (existing?.id) {
    s.taskTabs[t.id] = existing.id;
    await focus(existing.id);
    return;
  }
  const tab = await chrome.tabs.create({
    url,
    active: true,
    ...(s.originTabId !== null ? { openerTabId: s.originTabId } : {}),
  });
  if (tab.id) s.taskTabs[t.id] = tab.id;
}
