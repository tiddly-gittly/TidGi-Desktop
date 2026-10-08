export interface ApplicationActivationGate {
  markInitializationFailed(): void;
  markInitializationReady(): void;
  requestMainWindow(): Promise<void>;
}

/**
 * macOS may emit `activate` while the main-process `ready` handler is still
 * initializing databases and window state. Electron's `screen` module is
 * available after `app.whenReady()`, but opening a TidGi window is only safe
 * after the complete application initialization boundary has finished.
 *
 * Coalesce activation requests behind that boundary. A failed startup settles
 * the gate without opening a partially initialized window.
 */
export function createApplicationActivationGate(options: {
  logger: { error(message: string, metadata?: Record<string, unknown>): void };
  openMainWindow: () => Promise<void>;
}): ApplicationActivationGate {
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
