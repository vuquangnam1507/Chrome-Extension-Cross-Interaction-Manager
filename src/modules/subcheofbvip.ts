import { makeModule } from './base';
const module = makeModule('subcheofbvip', 'FOLLOW', 'batch');
const keys = new WeakMap<HTMLElement, string>();
const detectUrl = module.detect;
module.detect = (el, config) => {
  const known = detectUrl(el, config);
  if (known) return known;
  if (!el.matches('button.btn.btn-default')) return null;
  const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (/nhận|xu|thưởng|đăng nhập|tải lại|bỏ qua|cấu hình|đăng xuất/i.test(label)) return null;
  // User-authorized class-based opening, restricted to the batch Follow page.
  // Identity survives DOM reordering, never uses an index or executes handler text.
  let key = keys.get(el);
  if (!key) {
    const identity = el.id || el.getAttribute('onclick');
    key = identity ? encodeURIComponent(identity) : crypto.randomUUID();
    keys.set(el, key);
  }
  return {
    id: `subcheofbvip:button:${key}`,
    sourceButtonKey: key,
    page: 'subcheofbvip',
    kind: 'FOLLOW',
    url: '',
    label: label || 'Follow',
  };
};
export default module;
