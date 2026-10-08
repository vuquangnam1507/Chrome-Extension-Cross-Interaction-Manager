import type { Task, State } from '../types';
export const dedupe = (tasks: Task[]) => [...new Map(tasks.map((t) => [t.id, t])).values()];
export const pending = (s: State) =>
  s.tasks.filter((t) => !s.completedTasks.includes(t.id) && !s.skippedTasks.includes(t.id));
export const batchComplete = (s: State) =>
  s.tasks.length > 0 && s.tasks.every((t) => s.completedTasks.includes(t.id));
