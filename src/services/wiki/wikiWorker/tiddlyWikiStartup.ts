interface TiddlyWikiBoot {
  startup: (options: { bootPath: string; callback: () => void }) => void;
}

/**
 * TiddlyWiki startup can span asynchronous startup modules. Resolve only from
 * its completion callback; returning from boot.startup() is not a readiness
 * signal.
 */
export function waitForTiddlyWikiStartup(boot: TiddlyWikiBoot, bootPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      boot.startup({ bootPath, callback: resolve });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
