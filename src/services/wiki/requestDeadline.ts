/** Bound an IPC wait without letting a late reply resume its success path. */
export async function withWikiDeadline<T>(request: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Wiki request timed out; changes have not been confirmed saved'));
        }, Math.max(0, deadline - Date.now()));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
