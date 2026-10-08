import { initialState } from '../config/pages';
import type { State } from '../types';
export async function readState(): Promise<State> {
  const { state } = await chrome.storage.local.get('state');
  if (!state || state.version !== 1) return initialState();
  if (!state.automationRevision)
    return {
      ...initialState(),
      ...state,
      automationRevision: 1,
      running: false,
      phase: 'STOPPED',
      operation: null,
      dueAt: null,
      emptyRetryAt: null,
      loadDeadline: null,
      scanToken: null,
    };
  return { ...initialState(), ...state };
}
export const saveState = (state: State) => chrome.storage.local.set({ state });
