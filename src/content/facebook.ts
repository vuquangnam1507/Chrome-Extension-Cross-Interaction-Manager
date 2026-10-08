// Chỉ thông báo dấu hiệu đăng nhập; không thao tác Like/Follow hoặc đọc thông tin tài khoản.
if (
  /^\/(login|checkpoint)(\/|\.|$)/.test(location.pathname) ||
  document.querySelector('input[type="password"]')
)
  void chrome.runtime.sendMessage({ type: 'FB_LOGIN' }).catch(() => {});
