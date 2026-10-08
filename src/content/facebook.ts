import { installAutomaticHandler, waitFor } from './automatic-runtime';
import { facebookScope, socialControl } from './automatic-dom';
import { visible } from './detection';
installAutomaticHandler(async ({ request: { task, config }, signal, guard }) => {
  function inspect() {
    if (!navigator.onLine) throw Error('Mất kết nối mạng.');
    if (
      /^\/(login|checkpoint)(\/|\.|$)/.test(location.pathname) ||
      [...document.querySelectorAll<HTMLElement>('input[type="password"]')].some(visible)
    )
      throw Error('Facebook yêu cầu đăng nhập hoặc kiểm tra tài khoản.');
    return socialControl(facebookScope(document, task, config), task.kind);
  }
  const control = await waitFor(inspect, signal);
  if (!control.done) {
    await guard();
    const current = inspect();
    if (!current) throw Error('Nút tương tác đã thay đổi.');
    if (!current.done) current.button.click();
  }
  await waitFor(() => {
    const next = inspect();
    return next?.done ? true : null;
  }, signal);
  return {
    verified: true,
    detail: `Facebook đã hiển thị trạng thái ${task.kind === 'LIKE' ? 'đã thích' : 'đang theo dõi'}.`,
  };
});
// No page inspection or interaction occurs in unrelated Facebook tabs.
void chrome.runtime.sendMessage({ type: 'FB_READY' }).catch(() => {});
