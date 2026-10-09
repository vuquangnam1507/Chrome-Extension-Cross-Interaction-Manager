import { installAutomaticHandler, waitFor, DomWaitTimeout } from './automatic-runtime';
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
  const quickFollow = task.page === 'subcheofbvip' && task.kind === 'FOLLOW';
  let control;
  if (quickFollow) {
    // Bấm Follow ngay khi nút xuất hiện; chỉ tiếp tục quan sát tối đa 5 giây cho dữ liệu tải muộn.
    try {
      control = await waitFor(
        inspect,
        signal,
        5000,
        () => `FACEBOOK_FIND_CONTROL: ${resolutionError}`,
      );
    } catch (e) {
      if (!(e instanceof DomWaitTimeout)) throw e;
      await guard();
      return {
        verified: false,
        skipped: 'missing-follow-control' as const,
        detail: `Bỏ qua sau 5 giây chưa xác định được nút Follow: ${resolutionError}`,
      };
    }
  } else {
    control = await waitFor(
      inspect,
      signal,
      20000,
      () => `FACEBOOK_FIND_CONTROL: ${resolutionError}`,
    );
  }
  if (!control.done) {
    await guard();
    const current = quickFollow ? (control.button.isConnected ? control : null) : inspect();
    if (!current) {
      if (quickFollow)
        return {
          verified: false,
          skipped: 'missing-follow-control' as const,
          detail: 'Bỏ qua: nút Follow đã biến mất trước khi bấm.',
        };
      throw Error(resolutionError || 'Nút tương tác đã thay đổi.');
    }
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
    () =>
      `FACEBOOK_CONFIRM: ${task.kind === 'FOLLOW' ? 'Đã bấm Follow nhưng chưa thấy Đang theo dõi/Following. ' : ''}${timeoutDetail()}`,
  );
  return {
    verified: true,
    detail: `Facebook đã hiển thị trạng thái ${task.kind === 'LIKE' ? 'đã thích' : 'đang theo dõi'}.`,
  };
});
// No page inspection or interaction occurs in unrelated Facebook tabs.
void chrome.runtime.sendMessage({ type: 'FB_READY' }).catch(() => {});
