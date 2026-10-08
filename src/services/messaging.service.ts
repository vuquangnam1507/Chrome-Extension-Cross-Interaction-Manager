import type { Command, State } from '../types';
export async function sendCommand(command: Command): Promise<State> {
  const reply = await chrome.runtime.sendMessage(command);
  if (!reply?.ok) throw Error(reply?.error || 'Không kết nối được background.');
  return reply.state;
}
