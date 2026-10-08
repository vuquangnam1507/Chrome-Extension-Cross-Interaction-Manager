import { installAutomaticHandler, waitFor } from './automatic-runtime';
import { facebookScope, socialControl, FacebookScopeError } from './automatic-dom';
import { visible } from './detection';
installAutomaticHandler(async ({ request: { operation, task, config }, signal, guard }) => {
  if (operation.stage !== 'FACEBOOK_ACTION') throw Error('Bước không thuộc Facebook.');
  let pinnedScope: ParentNode | null = null;
  let resolutionError = '';
  function inspect() {
    if (!navigator.onLine) throw Error('Mất kết nối mạng.');
    if (
      /^\/(login|checkpoint)(\/|\.|$)/.test(location.pathname) ||
      [...document.querySelectorAll<HTMLElement>('input[type="password"]')].some(visible)
    )
      throw Error('Facebook yêu cầu đăng nhập hoặc kiểm tra tài khoản.');
    try {
      if (pinnedScope instanceof HTMLElement && !pinnedScope.isConnected) {
        // React may replace the entire post after a successful interaction.
        // Rebind only with a matching permalink, never with a positional fallback.
        pinnedScope = facebookScope(
          document,
          task,
          config,
          operation.documentUrl || task.url,
          true,
        );
      }
      const scope =
        pinnedScope || facebookScope(document, task, config, operation.documentUrl || task.url);
      const control = socialControl(scope, task.kind);
      resolutionError = control ? '' : 'Chưa tìm thấy nút tương tác của bài viết đích.';
      return control ? { ...control, scope } : null;
    } catch (error) {
      if (!(error instanceof FacebookScopeError)) throw error;
      resolutionError = error.message;
      return null; // Facebook may still be hydrating the post, dialog or permalink.
    }
  }
  const timeoutDetail = () =>
    resolutionError ||
    'Đã gửi thao tác nhưng chưa thấy dấu hiệu xác nhận trên nút Facebook (nhãn Đã thích/Bỏ thích hoặc aria-pressed). Không bấm lại để tránh đảo ngược tương tác.';
  let control;
  if (task.page === 'subcheofbvip' && task.kind === 'FOLLOW') {
    // Only the initial discovery is immediate; never skip an uncertain result
    // after a click. Wait for document load, not an arbitrary grace period.
    await waitFor(() => (document.readyState === 'complete' ? true : null), signal);
    await guard();
    control = inspect();
    if (!control && resolutionError === 'Chưa tìm thấy nút tương tác của bài viết đích.') {
      return {
        verified: false,
        skipped: 'missing-follow-control' as const,
        detail: 'Bỏ qua: tab đã tải xong nhưng không có nút Follow; chưa thực hiện tương tác.',
      };
    }
  }
  control ||= await waitFor(inspect, signal, 20000, timeoutDetail);
  if (!control.done) {
    await guard();
    const current = inspect();
    if (!current) throw Error(resolutionError || 'Nút tương tác đã thay đổi.');
    pinnedScope = current.scope;
    if (!current.done) current.button.click();
  } else pinnedScope = control.scope;
  await waitFor(
    () => {
      const next = inspect();
      return next?.done ? true : null;
    },
    signal,
    20000,
    timeoutDetail,
  );
  return {
    verified: true,
    detail: `Facebook đã hiển thị trạng thái ${task.kind === 'LIKE' ? 'đã thích' : 'đang theo dõi'}.`,
  };
});
// No page inspection or interaction occurs in unrelated Facebook tabs.
void chrome.runtime.sendMessage({ type: 'FB_READY' }).catch(() => {});
