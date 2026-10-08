import { installAutomaticHandler, waitFor } from './automatic-runtime';
import { controls, successMessages } from './automatic-dom';
import { interactive, rewardElements } from './detection';
import { modules } from '../modules';
import type { AdapterConfig, Task } from '../types';
const ancestors = new Map<string, HTMLElement[]>();
function taskButton(task: Task, config: AdapterConfig) {
  const matches = [...document.querySelectorAll<HTMLElement>(config.taskSelector)].filter(
    (el) => interactive(el) && modules[task.page].detect(el, config)?.id === task.id,
  );
  if (matches.length !== 1) throw Error('Không tìm được duy nhất nút gốc của công việc.');
  return matches[0];
}
export function individualReward(
  task: Task,
  config: AdapterConfig,
  roots: HTMLElement[],
): HTMLElement | null {
  for (const root of roots) {
    if (!root.isConnected || root === document.body || root === document.documentElement) continue;
    if (config.containerSelector && !root.matches(config.containerSelector)) continue;
    const otherTasks = [...root.querySelectorAll<HTMLElement>(config.taskSelector)].some((el) => {
      const found = modules[task.page].detect(el, config);
      return found && found.id !== task.id;
    });
    if (otherTasks) continue;
    const buttons = config.individualRewardSelector
      ? [...root.querySelectorAll<HTMLElement>(config.individualRewardSelector)].filter(interactive)
      : controls(root, ['nhận xu', 'nhận thưởng']);
    if (buttons.length > 1) throw Error('Có nhiều nút nhận thưởng trong cùng công việc.');
    if (buttons.length === 1) return buttons[0];
  }
  return null;
}
installAutomaticHandler(async ({ request: { operation, task, config }, signal, guard }) => {
  if (operation.stage === 'OPEN_TASK') {
    const button = taskButton(task, config);
    const roots: HTMLElement[] = [];
    let node: HTMLElement | null = button;
    while (node && node !== document.body) {
      roots.push(node);
      node = node.parentElement;
    }
    ancestors.set(task.id, roots);
    await guard();
    if (!interactive(button)) throw Error('Nút công việc không còn khả dụng.');
    button.click();
    return { verified: false, detail: 'Đã bấm nút mở công việc trên trang gốc.' };
  }
  if (operation.stage !== 'CLAIM_REWARD' && operation.stage !== 'CLAIM_BATCH')
    throw Error('Bước không thuộc trang nguồn.');
  const button = await waitFor(() => {
    if (operation.stage === 'CLAIM_BATCH') {
      const matches = rewardElements(document, true, config, null, task.page);
      if (matches.length > 1) throw Error('Có nhiều nút Nhận tất cả xu.');
      return matches[0] || null;
    }
    return individualReward(task, config, ancestors.get(task.id) || []);
  }, signal);
  const before = new Set(successMessages(document, config));
  await guard();
  if (!interactive(button)) throw Error('Nút nhận thưởng đã thay đổi.');
  button.click();
  const evidence = await waitFor(
    () => successMessages(document, config).find((text) => !before.has(text)) || null,
    signal,
  );
  ancestors.delete(task.id);
  return { verified: true, detail: `Trang nguồn báo: ${evidence.slice(0, 180)}` };
});
