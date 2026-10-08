import type { AdapterConfig } from '../types';
import { interactive, visible } from './detection';
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
export function emptyListVisible(root: Document, config: AdapterConfig): boolean {
  if (
    config.emptySelector &&
    [...root.querySelectorAll<HTMLElement>(config.emptySelector)].some(visible)
  )
    return true;
  const walker = root.createTreeWalker(root.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      normalize(node.textContent || '').includes('chưa có thêm nhiệm vụ') &&
      node.parentElement &&
      visible(node.parentElement)
    )
      return true;
  }
  return false;
}
export function reloadListButton(root: Document): HTMLElement {
  const buttons = [
    ...root.querySelectorAll<HTMLElement>(
      'button,a,[role="button"],input[type="button"],input[type="submit"]',
    ),
  ].filter((el) => {
    const label = normalize(el instanceof HTMLInputElement ? el.value : el.textContent || '');
    return interactive(el) && ['tải lại danh sách', 'tải lại'].includes(label);
  });
  if (buttons.length !== 1)
    throw Error(
      buttons.length
        ? 'Có nhiều nút tải lại; cần xác minh HTML nút tải lại danh sách.'
        : 'Không tìm thấy nút Tải lại danh sách. Cần cung cấp HTML nút tải lại để cập nhật adapter.',
    );
  return buttons[0];
}
