export type PageId = 'likepostvipcheo' | 'likepostvipre' | 'subcheo' | 'subcheofbvip';
export type Phase =
  | 'STOPPED'
  | 'IDLE'
  | 'LOADING_PAGE'
  | 'SCANNING_TASKS'
  | 'TASK_AVAILABLE'
  | 'WAITING_USER_ACTION'
  | 'WAITING_CONFIRMATION'
  | 'TASK_COMPLETED'
  | 'PAGE_COMPLETED'
  | 'WAITING_NEXT_PAGE'
  | 'ERROR';
export interface Task {
  id: string;
  page: PageId;
  kind: 'LIKE' | 'FOLLOW';
  url: string;
  label: string;
}
export interface AdapterConfig {
  taskSelector: string;
  containerSelector: string;
  urlAttribute: string;
  individualRewardSelector: string;
  emptySelector: string;
  facebookScopeSelector?: string;
  rewardSuccessSelector?: string;
}
export interface AutoOperation {
  id: string;
  stage: 'OPEN_TASK' | 'FACEBOOK_ACTION' | 'CLAIM_REWARD' | 'CLAIM_BATCH';
  taskId: string;
  tabId: number;
  deadline: number;
}
export interface Settings {
  delaySeconds: number;
  order: PageId[];
  enabled: Record<PageId, boolean>;
  adapters: Record<PageId, AdapterConfig>;
}
export interface State {
  version: 1;
  automationRevision: number;
  workflowWindowId: number | null;
  operation: AutoOperation | null;
  verifiedTasks: string[];
  rewardedTasks: string[];
  running: boolean;
  phase: Phase;
  currentPageIndex: number;
  currentTaskId: string | null;
  completedTasks: string[];
  skippedTasks: string[];
  tasks: Task[];
  settings: Settings;
  activityLogs: { time: number; text: string }[];
  lastTransitionTime: number;
  originTabId: number | null;
  taskTabs: Record<string, number>;
  dueAt: number | null;
  emptyRetryAt: number | null;
  emptyRetryCount: number;
  loadDeadline: number | null;
  error: string | null;
  rewardTaskId: string | null;
  batchRewardConfirmed: boolean;
  emptyVisits: number;
  scanToken: string | null;
}
export type Command =
  | {
      type:
        | 'GET'
        | 'STOP'
        | 'OPEN'
        | 'CONFIRM'
        | 'SKIP_TASK'
        | 'SKIP_PAGE'
        | 'FINISH_PAGE'
        | 'REWARD_CONFIRMED'
        | 'BACK'
        | 'HIGHLIGHT'
        | 'CLEAR'
        | 'RESCAN';
    }
  | { type: 'START'; enabled?: Settings['enabled']; windowId?: number }
  | { type: 'SETTINGS'; settings: Settings };
export interface Scan {
  type: 'SCAN';
  page: PageId;
  token: string;
  tasks: Task[];
  status: 'ok' | 'empty' | 'unknown' | 'login' | 'offline';
  detail: string;
}
