/**
 * Utility functions for Native Node.js Worker Threads communication
 * Replaces threads.js with native worker_threads API
 *
 * Note: Service registration for workers will be handled by electron-ipc-cat/worker in the future
 * This file contains TidGi-specific worker proxy functionality (e.g., git worker)
 */

import { cloneDeep } from 'lodash';
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
              worker.postMessage({
                type: 'call',
                id,
                method,
                args: serializedArguments,
              } as WorkerMessage);
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
              worker.postMessage({
                type: 'call',
                id,
                method,
                args: serializedArguments,
              } as WorkerMessage);
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
 * Worker-side message handler
 * Usage in worker: handleWorkerMessages({ methodName: implementation });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const result = implementation(...(args || []));
      // Check if result is Observable
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
