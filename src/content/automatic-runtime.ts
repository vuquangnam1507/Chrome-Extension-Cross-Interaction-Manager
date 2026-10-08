import type { AdapterConfig, AutoOperation, Task } from '../types';
import { pageFromUrl } from '../config/pages';
import { matchesFacebookOperation } from '../utils/url';
export interface AutoRequest {
  type: 'AUTO_STEP';
  operation: AutoOperation;
  task: Task;
  config: AdapterConfig;
}
export interface AutoContext {
  request: AutoRequest;
  signal: AbortSignal;
  guard: () => Promise<void>;
}
export function installAutomaticHandler(
  run: (context: AutoContext) => Promise<{ verified: boolean; detail: string }>,
) {
  let active: AbortController | undefined;
  const handled = new Set<string>();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      (changes.automationStop?.newValue === true ||
        changes.state?.newValue?.running === false ||
        changes.state?.newValue?.phase === 'ERROR')
    )
      active?.abort();
  });
  chrome.runtime.onMessage.addListener((m: AutoRequest, sender, reply) => {
    if (sender.id !== chrome.runtime.id || m.type !== 'AUTO_STEP') return;
    if (handled.has(m.operation.id)) {
      reply({ ok: true });
      return;
    }
    handled.add(m.operation.id);
    if (handled.size > 500) handled.delete(handled.values().next().value!);
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const guard = async () => {
      if (controller.signal.aborted) throw Error('Đã hủy thao tác.');
      const { state, automationStop } = await chrome.storage.local.get(['state', 'automationStop']);
      if (
        controller.signal.aborted ||
        automationStop ||
        !state?.running ||
        state.phase === 'ERROR' ||
        state.operation?.id !== m.operation.id ||
        Date.now() >= m.operation.deadline
      )
        throw Error('Workflow đã dừng hoặc bước đã hết hiệu lực.');
      if (
        m.operation.stage === 'FACEBOOK_ACTION'
          ? !matchesFacebookOperation(location.href, m.task.url, m.operation.documentUrl)
          : pageFromUrl(location.href) !== m.task.page
      )
        throw Error('URL hiện tại không thuộc công việc.');
      const permission = await chrome.runtime.sendMessage({
        type: 'AUTO_GUARD',
        operationId: m.operation.id,
      });
      if (controller.signal.aborted || !permission?.ok)
        throw Error('Tab không còn nằm trong phạm vi workflow.');
    };
    reply({ ok: true });
    void (async () => {
      try {
        await guard();
        const result = await run({ request: m, signal: controller.signal, guard });
        await guard();
        await chrome.runtime.sendMessage({
          type: 'AUTO_RESULT',
          operationId: m.operation.id,
          ok: true,
          ...result,
        });
      } catch (e) {
        void chrome.runtime
          .sendMessage({
            type: 'AUTO_RESULT',
            operationId: m.operation.id,
            ok: false,
            detail: String(e),
          })
          .catch(() => {});
      }
    })();
  });
}
export function waitFor<T>(read: () => T | null, signal: AbortSignal, timeout = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(check);
    const abort = () => end(undefined, Error('Đã hủy thao tác.'));
    function end(value?: T, error?: unknown) {
      if (finished) return;
      finished = true;
      observer.disconnect();
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value!);
    }
    function check() {
      try {
        if (signal.aborted) return abort();
        const result = read();
        if (result !== null) end(result);
      } catch (e) {
        end(undefined, e);
      }
    }
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(
      () => end(undefined, Error('Hết thời gian chờ DOM xác nhận kết quả.')),
      timeout,
    );
    check();
  });
}
