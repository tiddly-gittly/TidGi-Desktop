import type { UtilityProcess } from 'electron';
import type { WorkerPeer } from 'electron-ipc-cat/host';

/**
 * Adapt Electron's strongly-typed UtilityProcess event surface to the small
 * peer contract used by electron-ipc-cat.
 *
 * Electron exposes the `error` event as a three-field diagnostic callback,
 * while electron-ipc-cat expects an Error.  Converting it here keeps the
 * boundary explicit and preserves the diagnostic report for the host-side
 * rejection path instead of hiding the mismatch behind a type assertion.
 */
export function createUtilityProcessWorkerPeer(process: UtilityProcess): WorkerPeer {
  return new UtilityProcessWorkerPeer(process);
}

class UtilityProcessWorkerPeer implements WorkerPeer {
  constructor(private readonly process: UtilityProcess) {}

  postMessage(message: unknown): void {
    this.process.postMessage(message);
  }

  on(event: 'message', handler: (message: unknown) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'exit', handler: (code: number) => void): void;
  on(
    event: 'message' | 'error' | 'exit',
    handler: ((value: unknown) => void) | ((error: Error) => void) | ((code: number) => void),
  ): void {
    if (event === 'message') {
      this.process.on('message', (message: unknown) => {
        Reflect.apply(handler, undefined, [message]);
      });
      return;
    }
    if (event === 'error') {
      this.process.on('error', (type, location, report) => {
        const error = new Error(`${type} at ${location}`);
        error.name = 'UtilityProcessError';
        if (report.length > 0) error.stack = report;
        Reflect.apply(handler, undefined, [error]);
      });
      return;
    }
    this.process.on('exit', (code) => {
      Reflect.apply(handler, undefined, [code]);
    });
  }
}
