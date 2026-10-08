export function isTabEditBusy(error: unknown): boolean {
  return /tabs cannot be edited right now/i.test(
    error instanceof Error ? error.message : String(error),
  );
}
// Retry only Chrome's explicit temporary edit lock, never ambiguous API failures.
export async function retryTabEdit<T>(
  action: () => Promise<T>,
  cancelled: () => boolean,
): Promise<T | undefined> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (cancelled()) return undefined;
    try {
      return await action();
    } catch (error) {
      if (!isTabEditBusy(error) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, [250, 500, 1000][attempt]));
    }
  }
}
