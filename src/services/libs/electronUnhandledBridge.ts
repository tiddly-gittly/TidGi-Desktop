/**
 * Bridge to load electron-unhandled (pure ESM with top-level await, can't be
 * required() by CJS). Uses dynamic import() to load the ESM module at runtime.
 */
interface UnhandledOptions {
  showDialog?: boolean;
  logger?: (error: Error) => void;
  reportButton?: (error: Error) => void;
}

export async function setupUnhandled(options: UnhandledOptions): Promise<void> {
  const mod = await import('electron-unhandled');
  mod.default(options);
}
