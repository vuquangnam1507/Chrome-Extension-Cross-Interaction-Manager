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
