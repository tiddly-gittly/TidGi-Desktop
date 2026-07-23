/**
 * Utility functions for Worker Threads and Electron UtilityProcess communication.
 *
 * Replaces threads.js with native worker_threads / utilityProcess API.
 * Both `Worker` and `UtilityProcess` satisfy the `WorkerPeer` interface, so
 * `createWorkerProxy` works with either — the caller decides which process
 * model to use.
 *
 * Note: Service registration for workers calling back to main process
 * services is handled by `electron-ipc-cat` (attachWorker / attachUtilityProcess).
 * This file contains TidGi-specific RPC proxy functionality (e.g. git worker
 * method calls).
 */

import { cloneDeep } from 'lodash';
import { Observable, Subject } from 'rxjs';

export interface WorkerMessage<T = unknown> {
  type: 'call' | 'response' | 'error' | 'stream' | 'complete';
  id?: string;
  method?: string;
  args?: unknown[];
  result?: T;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

/**
 * Minimal peer interface that both Node.js `Worker` and Electron
 * `UtilityProcess` satisfy. Used by `createWorkerProxy` on the main-process
 * side to send/receive RPC messages.
 */
export interface WorkerPeer {
  postMessage(message: unknown): void;
  on(event: 'message', handler: (message: unknown) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'exit', handler: (code: number) => void): void;
}

/**
 * Create a worker proxy that mimics threads.js API.
 * Works with both `Worker` (worker_threads) and `UtilityProcess`.
 *
 * Usage: const proxy = createWorkerProxy<WorkerType>(workerOrUtilityProcess);
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters, @typescript-eslint/no-explicit-any -- T is needed to provide type safety for the returned proxy object, any is needed to support various worker method signatures
export function createWorkerProxy<T extends Record<string, (...arguments_: any[]) => any>>(
  peer: WorkerPeer,
): T {
  const pendingCalls = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    subject?: Subject<unknown>;
  }>();

  // Listen to peer messages
  peer.on('message', (rawMessage: unknown) => {
    const message = rawMessage as WorkerMessage;
    const pending = pendingCalls.get(message.id!);
    if (!pending) return;

    switch (message.type) {
      case 'response': {
        pending.resolve(message.result);
        pendingCalls.delete(message.id!);
        break;
      }
      case 'error': {
        const error = new Error(message.error!.message);
        error.name = message.error!.name || 'WorkerError';
        error.stack = message.error!.stack;
        pending.reject(error);
        pendingCalls.delete(message.id!);
        break;
      }
      case 'stream':
        if (pending.subject) {
          pending.subject.next(message.result);
        }
        break;
      case 'complete':
        if (pending.subject) {
          pending.subject.complete();
          pendingCalls.delete(message.id!);
        }
        break;
    }
  });

  // Reject all pending calls on error or unexpected exit
  const rejectAll = (error: Error): void => {
    for (const [id, pending] of pendingCalls.entries()) {
      pending.reject(error);
      if (pending.subject) {
        pending.subject.error(error);
      }
      pendingCalls.delete(id);
    }
  };

  peer.on('error', (error: unknown) => {
    const error_ = error instanceof Error ? error : new Error(String(error));
    rejectAll(error_);
  });

  peer.on('exit', (code: number) => {
    if (code !== 0) {
      rejectAll(new Error(`Peer process exited with code ${code}`));
    }
  });

  // Create proxy object
  return new Proxy({} as T, {
    get: (_target, method: string | symbol) => {
      // Prevent proxy from being treated as a Promise
      // When JS engine checks if object is thenable, it accesses 'then' property
      if (method === 'then' || method === 'catch' || method === 'finally') {
        return undefined;
      }

      // Symbol properties should not be proxied
      if (typeof method === 'symbol') {
        return undefined;
      }

      return (...arguments_: unknown[]) => {
        const id = `${method}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        // Check if the return type should be Observable (for compatibility with existing code)
        // We detect this by checking if the method name suggests streaming behavior
        // Common patterns: init*, start*, sync*, commit*, clone*, force*, execute*, *Observer*, get*Observer
        const isObservable = method.includes('init') || method.includes('sync') || method.includes('commit') ||
          method.includes('start') || method.includes('clone') || method.includes('force') ||
          method.includes('execute') || method.toLowerCase().includes('observer');

        if (isObservable) {
          // Return Observable for streaming responses
          return new Observable((observer) => {
            const subject = new Subject();
            subject.subscribe(observer);

            pendingCalls.set(id, {
              resolve: () => {},
              reject: (error) => {
                subject.error(error);
              },
              subject,
            });

            // Deep clone arguments to ensure they can be serialized
            const serializedArguments = arguments_.map((argument) => cloneDeep(argument));

            try {
              peer.postMessage({
                type: 'call',
                id,
                method,
                args: serializedArguments,
              });
            } catch (error) {
              console.error(`[workerAdapter] postMessage failed for Observable method ${method}:`, error);
              console.error(`[workerAdapter] Arguments:`, serializedArguments);
              throw error;
            }

            return () => {
              // Cleanup on unsubscribe
              pendingCalls.delete(id);
            };
          });
        } else {
          // Return Promise for regular calls
          return new Promise((resolve, reject) => {
            pendingCalls.set(id, { resolve, reject });

            // Deep clone arguments to ensure they can be serialized
            const serializedArguments = arguments_.map((argument) => cloneDeep(argument));

            try {
              peer.postMessage({
                type: 'call',
                id,
                method,
                args: serializedArguments,
              });
            } catch (error) {
              console.error(`[workerAdapter] postMessage failed for Promise method ${method}:`, error);
              console.error(`[workerAdapter] Arguments:`, serializedArguments);
              throw error;
            }
          });
        }
      };
    },
  });
}

/**
 * Message port interface for the child side (worker thread or utility process).
 */
interface MessagePortLike {
  postMessage(message: unknown): void;
  on(event: 'message', handler: (message: unknown) => void): void;
}

/**
 * Core message handler shared by both worker_threads and utility process.
 * Messages are processed sequentially so async operations (e.g. git commands)
 * do not interleave on the same repo.
 */
function handleMessages(
  methods: Record<string, (...arguments_: unknown[]) => unknown>,
  port: MessagePortLike,
): void {
  port.on('message', async (rawMessage: unknown) => {
    const message = rawMessage as WorkerMessage;
    const { id, method, args, type } = message;

    if (type !== 'call' || !method) return;

    const implementation = methods[method];
    if (!implementation) {
      port.postMessage(
        {
          type: 'error',
          id,
          error: {
            message: `Method '${method}' not found in worker`,
            name: 'MethodNotFoundError',
          },
        } satisfies WorkerMessage,
      );
      return;
    }

    try {
      // Worker methods are registered dynamically, so the runtime result needs explicit narrowing below.
      const result: unknown = implementation(...(args || []));
      // Check if result is Observable
      if (result && typeof result === 'object' && 'subscribe' in result && typeof result.subscribe === 'function') {
        (result as Observable<unknown>).subscribe({
          next: (value: unknown) => {
            port.postMessage(
              {
                type: 'stream',
                id,
                result: value,
              } satisfies WorkerMessage,
            );
          },
          error: (error: Error) => {
            port.postMessage(
              {
                type: 'error',
                id,
                error: {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                },
              } satisfies WorkerMessage,
            );
          },
          complete: () => {
            port.postMessage(
              {
                type: 'complete',
                id,
              } satisfies WorkerMessage,
            );
          },
        });
        // Note: we do NOT await Observable completion — some Observables (e.g.
        // startNodeJSWiki) never complete, they only emit next values. Awaiting
        // would permanently block the message handler. Per-workspace git
        // serialization is handled by operationLocks in GitService instead.
      } else if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
        // Handle Promise
        const resolvedValue = await (result as Promise<unknown>);
        port.postMessage(
          {
            type: 'response',
            id,
            result: resolvedValue,
          } satisfies WorkerMessage,
        );
      } else {
        // Handle synchronous result
        port.postMessage(
          {
            type: 'response',
            id,
            result,
          } satisfies WorkerMessage,
        );
      }
    } catch (error) {
      const error_ = error as Error;
      port.postMessage(
        {
          type: 'error',
          id,
          error: {
            message: error_.message,
            stack: error_.stack,
            name: error_.name,
          },
        } satisfies WorkerMessage,
      );
    }
  });
}

/**
 * Worker-thread-side message handler.
 * Uses `parentPort` from `worker_threads` (messages arrive as raw values).
 *
 * Usage in worker: handleWorkerMessages({ methodName: implementation });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleWorkerMessages(methods: Record<string, (...arguments_: any[]) => any>): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parentPort } = require('worker_threads') as typeof import('worker_threads');

  if (!parentPort) {
    throw new Error('This function must be called in a worker thread');
  }

  handleMessages(methods, parentPort);
}

/**
 * Utility-process-side message handler.
 * Uses `process.parentPort` from Electron (messages arrive wrapped in
 * `{ data, ports }` event objects, so we unwrap `event.data`).
 *
 * Usage in utility process: handleUtilityProcessMessages({ methodName: implementation });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleUtilityProcessMessages(methods: Record<string, (...arguments_: any[]) => any>): void {
  const port = (process as { parentPort?: MessagePortLike }).parentPort;

  if (!port) {
    throw new Error('This function must be called in an Electron utility process');
  }

  // Wrap to unwrap the { data, ports } event envelope
  handleMessages(methods, {
    postMessage: (message: unknown) => {
      port.postMessage(message);
    },
    on: (event, handler) => {
      if (event === 'message') {
        // Electron utility process delivers { data, ports } events
        (port as { on(event_: string, handler_: (...arguments_: unknown[]) => void): void }).on(event, (event_: unknown) => {
          handler((event_ as { data: WorkerMessage }).data);
        });
      }
    },
  });
}

/**
 * Terminate a worker peer gracefully.
 * Works with both `Worker` (terminate) and `UtilityProcess` (kill).
 */
export async function terminateWorker(peer: { terminate(): Promise<number> } | { kill(): boolean }): Promise<number> {
  if ('terminate' in peer) {
    return await peer.terminate();
  }
  return peer.kill() ? 0 : 1;
}
