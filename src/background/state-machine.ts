import type { Phase, State } from '../types';
const edges: Record<Phase, Phase[]> = {
  STOPPED: ['IDLE'],
  IDLE: ['LOADING_PAGE'],
  LOADING_PAGE: ['SCANNING_TASKS'],
  SCANNING_TASKS: ['TASK_AVAILABLE', 'PAGE_COMPLETED'],
  TASK_AVAILABLE: ['WAITING_USER_ACTION', 'TASK_COMPLETED', 'PAGE_COMPLETED', 'SCANNING_TASKS'],
  WAITING_USER_ACTION: ['WAITING_CONFIRMATION'],
  WAITING_CONFIRMATION: [
    'TASK_COMPLETED',
    'WAITING_USER_ACTION',
    'SCANNING_TASKS',
    'PAGE_COMPLETED',
  ],
  TASK_COMPLETED: ['TASK_AVAILABLE', 'PAGE_COMPLETED', 'SCANNING_TASKS'],
  PAGE_COMPLETED: ['WAITING_NEXT_PAGE', 'SCANNING_TASKS'],
  WAITING_NEXT_PAGE: ['LOADING_PAGE'],
  ERROR: ['IDLE', 'SCANNING_TASKS', 'PAGE_COMPLETED'],
};
export function transition(s: State, to: Phase) {
  if (s.phase === to) return;
  if (to !== 'STOPPED' && to !== 'ERROR' && !edges[s.phase].includes(to))
    throw Error(`Chuyển trạng thái không hợp lệ: ${s.phase} → ${to}`);
  s.phase = to;
}
export function nextIndex(s: State) {
  for (let n = 1; n <= 4; n++) {
    const i = (s.currentPageIndex + n) % 4;
    if (s.settings.enabled[s.settings.order[i]]) return i;
  }
  throw Error('Không có trang được bật.');
}
