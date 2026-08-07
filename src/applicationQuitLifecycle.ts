export interface QuitEventLike {
  preventDefault(): void;
}

export interface QuitApplicationLike {
  exit(code?: number): void;
  on(event: 'before-quit' | 'will-quit', listener: (event: QuitEventLike) => void): void;
}

export interface QuitLifecycleLogger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
}

export interface ApplicationQuitLifecycleOptions {
  abortStartup(): void;
  app: QuitApplicationLike;
  cleanup(): Promise<void>;
  forceExitAfterMs?: number;
  logger: QuitLifecycleLogger;
}

/**
 * Install before startup begins. Both macOS Quit AppleEvents and programmatic
 * app.quit() enter the same exactly-once cleanup path.
 */
export function installApplicationQuitLifecycle(options: ApplicationQuitLifecycleOptions): void {
  const {
    app,
    forceExitAfterMs = 15_000,
    logger,
  } = options;
  let cleanupPromise: Promise<void> | undefined;
  let exitRequested = false;

  const exitOnce = (): void => {
    if (exitRequested) return;
    exitRequested = true;
    app.exit(0);
  };

  const requestQuit = (event: QuitEventLike): void => {
    if (exitRequested) return;
    event.preventDefault();
    if (cleanupPromise !== undefined) return;

    // Abort queued/in-flight startup before beginning any asynchronous cleanup.
    options.abortStartup();
    const forceExitTimer = setTimeout(() => {
      logger.warn(`before-quit cleanup timed out after ${forceExitAfterMs} ms, forcing exit`);
      exitOnce();
    }, forceExitAfterMs);
    forceExitTimer.unref();

    cleanupPromise = options.cleanup()
      .catch((error: unknown) => {
        logger.error('before-quit cleanup failed unexpectedly', { error });
      })
      .finally(() => {
        clearTimeout(forceExitTimer);
        exitOnce();
      });
  };

  app.on('before-quit', requestQuit);
  app.on('will-quit', requestQuit);
}
