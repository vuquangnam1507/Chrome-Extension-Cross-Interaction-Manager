import type { AdapterConfig, PageId, Task } from '../types';
import { modules } from '../modules';
import { dedupe } from '../services/task.service';
export function visible(el: HTMLElement) {
  const style = getComputedStyle(el);
  return (
    !el.closest('[hidden],[inert],[aria-hidden="true"]') &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.getClientRects().length > 0
  );
}
export function interactive(el: HTMLElement) {
  return visible(el) && !el.matches(':disabled,[disabled],[aria-disabled="true"],.disabled');
}
export function detect(root: ParentNode, page: PageId, c: AdapterConfig): Task[] {
  return dedupe(
    [...root.querySelectorAll<HTMLElement>(c.taskSelector)]
      .filter(interactive)
      .map((el) => modules[page].detect(el, c))
      .filter((t): t is Task => !!t),
  );
}
export function rewardElements(
  root: ParentNode,
  batch: boolean,
  c: AdapterConfig,
  taskId: string | null,
  page: PageId,
) {
  if (batch)
    return [
      ...root.querySelectorAll<HTMLElement>('button,a,input[type="button"],input[type="submit"]'),
    ].filter(
      (el) =>
        interactive(el) &&
        ((el.textContent || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi') ===
          'nhận tất cả xu' ||
          (el instanceof HTMLInputElement &&
            el.value.toLocaleLowerCase('vi') === 'nhận tất cả xu')),
    );
  if (!c.individualRewardSelector || !c.containerSelector) return [];
  const task = [...root.querySelectorAll<HTMLElement>(c.taskSelector)].find(
    (el) => modules[page].detect(el, c)?.id === taskId,
  );
  return [
    ...(task
      ?.closest(c.containerSelector)
      ?.querySelectorAll<HTMLElement>(c.individualRewardSelector) || []),
  ].filter(interactive);
}

// Observed on /kiemtien/subcheofbvip/ when the session is absent:
// <h4>HÃY ĐĂNG NHẬP ĐỂ SỬ DỤNG</h4>, with no password input.
export function loginRequired(root: ParentNode): boolean {
  if ([...root.querySelectorAll<HTMLElement>('input[type="password"]')].some(visible)) return true;
  return [...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,[role="heading"]')].some(
    (el) =>
      visible(el) &&
      (el.textContent || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi') ===
        'hãy đăng nhập để sử dụng',
  );
}
export function scanDiagnostic(root: ParentNode, config: AdapterConfig): string {
  const candidates = [...root.querySelectorAll<HTMLElement>(config.taskSelector)];
  const active = candidates.filter(interactive).length;
  if (!candidates.length)
    return `Không tìm thấy nút khớp selector ${config.taskSelector}. Danh sách có thể chưa tải hoặc adapter chưa khớp HTML trang này.`;
  if (!active)
    return `Tìm thấy ${candidates.length} nút nhưng chưa có nút hiển thị và tương tác được. Kiểm tra trạng thái tải danh sách.`;
  return `Tìm thấy ${active} nút tương tác nhưng chưa trích xuất được URL Facebook hợp lệ của công việc. Cần kiểm tra outerHTML nút nhiệm vụ trên trang này; không tự coi là hết việc.`;
}
