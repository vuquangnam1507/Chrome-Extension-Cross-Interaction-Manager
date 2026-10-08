import { create } from 'zustand';
import type { State, Command } from '../types';
import { sendCommand } from '../services/messaging.service';
export const useWorkflow = create<{
  state: State | null;
  busy: boolean;
  error: string | null;
  execute: (c: Command) => Promise<void>;
}>((set) => ({
  state: null,
  busy: false,
  error: null,
  execute: async (c) => {
    set({ busy: true, error: null });
    try {
      const state = await sendCommand(c);
      set({ state });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ busy: false });
    }
  },
}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.state) useWorkflow.setState({ state: changes.state.newValue });
});
