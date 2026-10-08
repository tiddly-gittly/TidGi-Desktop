export interface GitFileChangeNotifier {
  notifyFileChange(
    wikiFolderLocation: string,
    options?: { onlyWhenGitLogOpened?: boolean },
  ): Promise<void> | void;
}

/**
 * Git history refreshes are advisory and must never take the Wiki worker down.
 *
 * Calls made through electron-ipc-cat are asynchronous even when the main-side
 * service method returns void.  A detached or overloaded host can therefore
 * reject after the caller has returned.  Contain both synchronous transport
 * failures and asynchronous timeouts so the worker's fail-fast
 * unhandled-rejection policy remains reserved for real Wiki failures.
 */
export async function notifyGitFileChangeBestEffort(
  notifier: GitFileChangeNotifier,
  wikiFolderLocation: string,
  onError?: (error: unknown) => void,
): Promise<void> {
  try {
    await notifier.notifyFileChange(wikiFolderLocation, { onlyWhenGitLogOpened: true });
  } catch (error) {
    onError?.(error);
  }
}
