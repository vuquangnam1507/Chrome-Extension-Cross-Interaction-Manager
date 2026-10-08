import { initialState } from '../config/pages';
import type { State } from '../types';
export async function readState(): Promise<State> {
  const { state } = await chrome.storage.local.get('state');
  if (!state || state.version !== 1) return initialState();
  return { ...initialState(), ...state };
}
export const saveState = (state: State) => chrome.storage.local.set({ state });
