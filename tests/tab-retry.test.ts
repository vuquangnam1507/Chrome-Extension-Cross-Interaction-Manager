import { it, expect, vi, afterEach } from 'vitest';
import { retryTabEdit } from '../src/background/tab-retry';
afterEach(() => vi.useRealTimers());
const busy = () => Error('Tabs cannot be edited right now (user may be dragging a tab).');
it('retry temporary Chrome edit lock then succeed', async () => {
  vi.useFakeTimers();
  const action = vi.fn().mockRejectedValueOnce(busy()).mockResolvedValue('done');
  const result = retryTabEdit(action, () => false);
  await vi.advanceTimersByTimeAsync(250);
  expect(await result).toBe('done');
  expect(action).toHaveBeenCalledTimes(2);
});
it('Stop cancels pending retry', async () => {
  vi.useFakeTimers();
  let stopped = false;
  const action = vi.fn().mockRejectedValue(busy());
  const result = retryTabEdit(action, () => stopped);
  await vi.advanceTimersByTimeAsync(0);
  stopped = true;
  await vi.advanceTimersByTimeAsync(250);
  expect(await result).toBeUndefined();
  expect(action).toHaveBeenCalledOnce();
});
it('unknown errors are not retried', async () => {
  const action = vi.fn().mockRejectedValue(Error('Unknown failure'));
  await expect(retryTabEdit(action, () => false)).rejects.toThrow('Unknown failure');
  expect(action).toHaveBeenCalledOnce();
});
it('busy retries are bounded at four attempts', async () => {
  vi.useFakeTimers();
  const action = vi.fn().mockRejectedValue(busy());
  const result = expect(retryTabEdit(action, () => false)).rejects.toThrow('Tabs cannot');
  await vi.advanceTimersByTimeAsync(1750);
  await result;
  expect(action).toHaveBeenCalledTimes(4);
});
