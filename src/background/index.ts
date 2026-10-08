import { AutomaticWorkflowManager } from './automatic-workflow';
import { pageFromUrl } from '../config/pages';
const manager = new AutomaticWorkflowManager();
const popupUrl = chrome.runtime.getURL('index.html');
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  let result: Promise<unknown>;
  if (sender.tab) {
    if (sender.tab.id === undefined) return;
    const id = sender.tab.id;
    if (message?.type === 'SCAN' && Array.isArray(message.tasks) && message.tasks.length <= 2000)
      result = manager.accept(message, id, sender.url || '');
    else if (message?.type === 'READY' && pageFromUrl(sender.url || ''))
      result = manager.pageReady(id);
    else if (message?.type === 'FB_READY')
      result = chrome.tabs.get(id).then((tab) => manager.observeTab(tab));
    else if (
      message?.type === 'AUTO_RESULT' &&
      typeof message.operationId === 'string' &&
      typeof message.ok === 'boolean'
    )
      result = chrome.tabs
        .get(id)
        .then((tab) => manager.automaticResult(message, tab, sender.url || ''));
    else return;
  } else if (
    sender.url === popupUrl &&
    ['GET', 'START', 'STOP', 'SETTINGS', 'CLEAR'].includes(message?.type)
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
chrome.tabs.onCreated.addListener((tab) => {
  void manager.observeTab(tab);
});
chrome.tabs.onRemoved.addListener((id) => {
  void manager.tabRemoved(id);
});
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete') void manager.pageReady(id);
  if (info.url || info.status === 'complete') void manager.observeTab(tab);
});
void manager.restore();
