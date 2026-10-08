import { installAutomaticHandler, waitFor } from './automatic-runtime';
import { facebookScope, socialControl } from './automatic-dom';
import { visible } from './detection';
installAutomaticHandler(async ({ request: { operation, task, config }, signal, guard }) => {
  if (operation.stage !== 'FACEBOOK_ACTION') throw Error('Bước không thuộc Facebook.');
  function inspect() {
    if (!navigator.onLine) throw Error('Mất kết nối mạng.');
    if (
      /^\/(login|checkpoint)(\/|\.|$)/.test(location.pathname) ||
      [...document.querySelectorAll<HTMLElement>('input[type="password"]')].some(visible)
    )
      throw Error('Facebook yêu cầu đăng nhập hoặc kiểm tra tài khoản.');
    if (
      !document.querySelector(
        config.facebookScopeSelector || 'main,[role="main"],article,[role="article"]',
      )
    )
      return null;
    return socialControl(
      facebookScope(document, { ...task, url: operation.documentUrl || task.url }, config),
      task.kind,
    );
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
