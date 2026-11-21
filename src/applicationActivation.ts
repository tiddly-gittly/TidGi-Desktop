/**
 * macOS may emit `activate` while the main-process `ready` handler is still
 * initializing databases and window state. Electron's `screen` module is
 * available after `app.whenReady()`, but opening a TidGi window is only safe
 * after the complete application initialization boundary has finished.
 *
 * Coalesce activation requests until initialization completes. A failed startup
 * must not open a partially initialized window.
 */
export function createApplicationActivationHandler(options: {
  logger: { error(message: string, metadata?: Record<string, unknown>): void };
  openMainWindow: () => Promise<void>;
}) {
  let initializationState: 'pending' | 'ready' | 'failed' = 'pending';
  let settleInitialization!: () => void;
  const initializationSettled = new Promise<void>(resolve => {
    settleInitialization = resolve;
  });
  let pendingOpen: Promise<void> | undefined;

  const settle = (state: 'ready' | 'failed'): void => {
    if (initializationState !== 'pending') return;
    initializationState = state;
    settleInitialization();
  };

  return {
    markInitializationFailed: () => {
      settle('failed');
    },
    markInitializationReady: () => {
      settle('ready');
    },
    requestMainWindow: () => {
      if (pendingOpen) return pendingOpen;
      pendingOpen = (async () => {
        await initializationSettled;
        if (initializationState !== 'ready') return;
        await options.openMainWindow();
      })()
        .catch((error: unknown) => {
          options.logger.error('Failed to open main window after application activation', { error });
        })
        .finally(() => {
          pendingOpen = undefined;
        });
      return pendingOpen;
    },
  };
}
