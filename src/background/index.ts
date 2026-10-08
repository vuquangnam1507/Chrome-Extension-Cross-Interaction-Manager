import { WorkflowManager } from './workflow-manager';
import { pageFromUrl } from '../config/pages';
const manager = new WorkflowManager();
const popupUrl = chrome.runtime.getURL('index.html');
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  let result: Promise<unknown>;
  if (sender.id !== chrome.runtime.id) return;
  if (sender.tab) {
    if (
      message?.type === 'SCAN' &&
      sender.tab.id !== undefined &&
      Array.isArray(message.tasks) &&
      message.tasks.length <= 2000
    )
      result = manager.accept(message, sender.tab.id, sender.url || '');
    else if (
      message?.type === 'READY' &&
      sender.tab.id !== undefined &&
      pageFromUrl(sender.url || '')
    )
      result = manager.pageReady(sender.tab.id);
    else if (message?.type === 'FB_LOGIN' && sender.tab.id !== undefined) {
      result = manager.dispatch(async (s) => {
        if (Object.values(s.taskTabs).includes(sender.tab!.id!))
          manager.log(s, 'Facebook có dấu hiệu chưa đăng nhập; hãy kiểm tra tab công việc.');
      });
    } else return;
  } else if (
    sender.url === popupUrl &&
    [
      'GET',
      'START',
      'STOP',
      'OPEN',
      'CONFIRM',
      'SKIP_TASK',
      'SKIP_PAGE',
      'FINISH_PAGE',
      'REWARD_CONFIRMED',
      'BACK',
      'HIGHLIGHT',
      'CLEAR',
      'RESCAN',
      'SETTINGS',
    ].includes(message?.type)
  )
    result = manager.command(message);
  else return;
  result
    .then((state) => reply({ ok: true, state }))
    .catch((e) => reply({ ok: false, error: String(e) }));
  return true;
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'crossengage') void manager.wake();
});
chrome.tabs.onRemoved.addListener((id) => {
  void manager.tabRemoved(id);
});
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'complete') void manager.pageReady(id);
});
void manager.restore();
