/**
 * Utility functions for Native Node.js Worker Threads communication
 * Replaces threads.js with native worker_threads API
 */

import { Observable, Subject } from 'rxjs';
import { Worker } from 'worker_threads';

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
 * Create a worker proxy that mimics threads.js API
 * Usage: const proxy = createWorkerProxy<WorkerType>(worker);
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters, @typescript-eslint/no-explicit-any -- T is needed to provide type safety for the returned proxy object, any is needed to support various worker method signatures
export function createWorkerProxy<T extends Record<string, (...arguments_: any[]) => any>>(
  worker: Worker,
): T {
  const pendingCalls = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    subject?: Subject<unknown>;
  }>();

  // Listen to worker messages
  worker.on('message', (message: WorkerMessage) => {
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

  worker.on('error', (error) => {
    // Reject all pending calls
    for (const [id, pending] of pendingCalls.entries()) {
      pending.reject(error);
      if (pending.subject) {
        pending.subject.error(error);
      }
      pendingCalls.delete(id);
    }
  });

  // Create proxy object
  return new Proxy({} as T, {
    get: (_target, method: string) => {
      return (...arguments_: unknown[]) => {
        const id = `${method}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        // Check if the return type should be Observable (for compatibility with existing code)
        // We detect this by checking if the method returns an Observable-like object
        const isObservable = method.includes('init') || method.includes('sync') || method.includes('commit');

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

            worker.postMessage({
              type: 'call',
              id,
              method,
              args: arguments_,
            } as WorkerMessage);

            return () => {
              // Cleanup on unsubscribe
              pendingCalls.delete(id);
            };
          });
        } else {
          // Return Promise for regular calls
          return new Promise((resolve, reject) => {
            pendingCalls.set(id, { resolve, reject });

            worker.postMessage({
              type: 'call',
              id,
              method,
              args: arguments_,
            } as WorkerMessage);
          });
        }
      };
    },
  });
}

/**
 * Worker-side message handler
 * Usage in worker: handleWorkerMessages({ methodName: implementation });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is needed to support various worker method signatures
export function handleWorkerMessages(methods: Record<string, (...arguments_: any[]) => any>): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parentPort } = require('worker_threads') as typeof import('worker_threads');

  if (!parentPort) {
    throw new Error('This function must be called in a worker thread');
  }

  parentPort.on('message', async (message: WorkerMessage) => {
    const { id, method, args, type } = message;

    if (type !== 'call' || !method) return;

    const implementation = methods[method];
    if (!implementation) {
      parentPort.postMessage({
        type: 'error',
        id,
        error: {
          message: `Method '${method}' not found in worker`,
          name: 'MethodNotFoundError',
        },
      } as WorkerMessage);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- result type is determined by worker method implementation
      const result = implementation(...(args || []));

      // Check if result is Observable
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- checking for Observable interface
      if (result && typeof result === 'object' && 'subscribe' in result && typeof result.subscribe === 'function') {
        (result as Observable<unknown>).subscribe({
          next: (value: unknown) => {
            parentPort.postMessage({
              type: 'stream',
              id,
              result: value,
            } as WorkerMessage);
          },
          error: (error: Error) => {
            parentPort.postMessage({
              type: 'error',
              id,
              error: {
                message: error.message,
                stack: error.stack,
                name: error.name,
              },
            } as WorkerMessage);
          },
          complete: () => {
            parentPort.postMessage({
              type: 'complete',
              id,
            } as WorkerMessage);
          },
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- checking for Promise interface
      } else if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
        // Handle Promise
        const resolvedValue = await (result as Promise<unknown>);
        parentPort.postMessage({
          type: 'response',
          id,
          result: resolvedValue,
        } as WorkerMessage);
      } else {
        // Handle synchronous result
        parentPort.postMessage({
          type: 'response',
          id,
          result,
        } as WorkerMessage);
      }
    } catch (error) {
      const error_ = error as Error;
      parentPort.postMessage({
        type: 'error',
        id,
        error: {
          message: error_.message,
          stack: error_.stack,
          name: error_.name,
        },
      } as WorkerMessage);
    }
  });
}

/**
 * Terminate worker gracefully
 */
export async function terminateWorker(worker: Worker): Promise<number> {
  return await worker.terminate();
}
