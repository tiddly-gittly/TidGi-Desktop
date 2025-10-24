/**
 * Helper for worker threads to call main process services via IPC.
 * This allows TiddlyWiki plugins running in wiki worker to access TidGi services.
 */

import { Observable, Subject } from 'rxjs';
import { parentPort } from 'worker_threads';

interface IServiceCallRequest {
  args: unknown[];
  id: string;
  method: string;
  service: string;
  type: 'service-call';
}

interface IServiceCallResponse {
  error?: {
    message: string;
    name?: string;
    stack?: string;
  };
  id: string;
  result?: unknown;
  type: 'service-response';
}

interface IServiceStreamResponse {
  error?: {
    message: string;
    name?: string;
    stack?: string;
  };
  id: string;
  result?: unknown;
  type: 'service-stream' | 'service-stream-complete';
}

const pendingServiceCalls = new Map<string, {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
}>();

const pendingStreamCalls = new Map<string, {
  reject: (error: Error) => void;
  subject: Subject<unknown>;
}>();

/**
 * Initialize service call handler in worker.
 * Must be called once when worker starts.
 */
export function initializeWorkerServiceCaller(): void {
  if (!parentPort) {
    throw new Error('parentPort is not available. This must run in a worker thread.');
  }

  parentPort.on('message', (message: IServiceCallResponse | IServiceStreamResponse) => {
    if (message.type === 'service-response') {
      const pending = pendingServiceCalls.get(message.id);
      if (!pending) return;

      if (message.error) {
        const error = new Error(message.error.message);
        error.name = message.error.name ?? 'ServiceCallError';
        error.stack = message.error.stack;
        pending.reject(error);
      } else {
        pending.resolve(message.result);
      }

      pendingServiceCalls.delete(message.id);
    } else if (message.type === 'service-stream') {
      const pending = pendingStreamCalls.get(message.id);
      if (!pending) return;

      if (message.error) {
        const error = new Error(message.error.message);
        error.name = message.error.name ?? 'ServiceCallError';
        error.stack = message.error.stack;
        pending.subject.error(error);
        pendingStreamCalls.delete(message.id);
      } else {
        pending.subject.next(message.result);
      }
    } else if (message.type === 'service-stream-complete') {
      const pending = pendingStreamCalls.get(message.id);
      if (!pending) return;

      pending.subject.complete();
      pendingStreamCalls.delete(message.id);
    }
  });
}

/**
 * Call a service method from worker thread.
 * Sends request to main process and waits for response.
 *
 * @param service Service name (e.g., 'workspace', 'wiki')
 * @param method Method name (e.g., 'getWorkspacesAsList', 'get')
 * @param methodArguments Arguments to pass to the method
 * @returns Promise resolving to the method's return value
 *
 * @example
 * const workspaces = await callMainProcessService('workspace', 'getWorkspacesAsList', []);
 * const workspace = await callMainProcessService('workspace', 'get', [workspaceId]);
 */
export async function callMainProcessService<T = unknown>(
  service: string,
  method: string,
  methodArguments: unknown[] = [],
): Promise<T> {
  if (!parentPort) {
    throw new Error('parentPort is not available. This must run in a worker thread.');
  }

  const id = `service_${service}_${method}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return await new Promise<T>((resolve, reject) => {
    pendingServiceCalls.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    const request: IServiceCallRequest = {
      type: 'service-call',
      id,
      service,
      method,
      args: methodArguments,
    };

    parentPort!.postMessage(request);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingServiceCalls.has(id)) {
        pendingServiceCalls.delete(id);
        reject(new Error(`Service call timeout: ${service}.${method}`));
      }
    }, 30_000);
  });
}

/**
 * Call a service method that returns an Observable.
 * Streams results from main process and completes when done.
 *
 * @param service Service name (e.g., 'workspace')
 * @param method Method name (e.g., 'get$')
 * @param methodArguments Arguments to pass to the method
 * @returns Observable that streams the method's results
 *
 * @example
 * callMainProcessServiceObservable('workspace', 'get$', [workspaceId]).subscribe(
 *   workspace => console.log(workspace),
 *   error => console.error(error),
 *   () => console.log('complete')
 * );
 */
export function callMainProcessServiceObservable<T = unknown>(
  service: string,
  method: string,
  methodArguments: unknown[] = [],
): Observable<T> {
  if (!parentPort) {
    throw new Error('parentPort is not available. This must run in a worker thread.');
  }

  const id = `service_${service}_${method}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return new Observable<T>((observer) => {
    const subject = new Subject<T>();
    subject.subscribe(observer);

    pendingStreamCalls.set(id, {
      reject: (error) => {
        subject.error(error);
      },
      subject: subject as Subject<unknown>,
    });

    const request: IServiceCallRequest = {
      type: 'service-call',
      id,
      service,
      method,
      args: methodArguments,
    };

    parentPort!.postMessage(request);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingStreamCalls.has(id)) {
        pendingStreamCalls.delete(id);
        subject.error(new Error(`Service call timeout: ${service}.${method}`));
      }
    }, 30_000);

    return () => {
      // Cleanup on unsubscribe
      pendingStreamCalls.delete(id);
    };
  });
}
