/**
 * Hijack console methods in worker thread to redirect logs to main process via native service.
 * This ensures worker logs are written to wiki-specific log files.
 */

import { native } from './services';

/** Store original console methods */
const originalConsole = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

/**
 * Hijack console methods to send logs to main process.
 * @param wikiName The label for logs (e.g., wiki workspace name)
 */
export function hijackConsoleForWiki(wikiName: string): void {
  console.log = (...arguments_: unknown[]) => {
    const message = arguments_.map((argument) => String(argument)).join(' ');
    void native.logFor(wikiName, 'debug', message);
    // Also output to original console for debugging
    originalConsole.log(...arguments_);
  };

  console.debug = (...arguments_: unknown[]) => {
    const message = arguments_.map((argument) => String(argument)).join(' ');
    void native.logFor(wikiName, 'debug', message);
    originalConsole.debug(...arguments_);
  };

  console.info = (...arguments_: unknown[]) => {
    const message = arguments_.map((argument) => String(argument)).join(' ');
    void native.logFor(wikiName, 'info', message);
    originalConsole.info(...arguments_);
  };

  console.warn = (...arguments_: unknown[]) => {
    const message = arguments_.map((argument) => String(argument)).join(' ');
    void native.logFor(wikiName, 'warn', message);
    originalConsole.warn(...arguments_);
  };

  console.error = (...arguments_: unknown[]) => {
    const message = arguments_.map((argument) => String(argument)).join(' ');
    const meta: Record<string, unknown> = {};
    // If first argument is Error object, include stack
    if (arguments_[0] instanceof Error) {
      meta.stack = arguments_[0].stack;
    }
    void native.logFor(wikiName, 'error', message, meta);
    originalConsole.error(...arguments_);
  };
}

/**
 * Restore original console methods.
 */
export function restoreConsole(): void {
  console.log = originalConsole.log;
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}
