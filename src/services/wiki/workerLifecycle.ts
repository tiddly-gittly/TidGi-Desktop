export const WIKI_WORKER_LIFECYCLE_MESSAGE_TYPE = 'tidgi-wiki-worker-lifecycle';

export type WikiWorkerLifecycleAction = 'subscriber-ready' | 'booted' | 'boot-error';

export interface WikiWorkerLifecycleMessage {
  type: typeof WIKI_WORKER_LIFECYCLE_MESSAGE_TYPE;
  action: WikiWorkerLifecycleAction;
  generation: string;
  workspaceID: string;
  error?: string;
}

interface Deferred {
  promise: Promise<void>;
  reject: (error: Error) => void;
  resolve: () => void;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = () => {
      resolvePromise();
    };
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function unwrapMessage(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'data' in value) {
    return value.data;
  }
  return value;
}

export function isWikiWorkerLifecycleMessage(value: unknown): value is WikiWorkerLifecycleMessage {
  const message = unwrapMessage(value);
  if (message === null || typeof message !== 'object') return false;
  const candidate = message as Partial<WikiWorkerLifecycleMessage>;
  return candidate.type === WIKI_WORKER_LIFECYCLE_MESSAGE_TYPE &&
    (candidate.action === 'subscriber-ready' || candidate.action === 'booted' || candidate.action === 'boot-error') &&
    typeof candidate.generation === 'string' &&
    typeof candidate.workspaceID === 'string';
}

/**
 * Retains worker lifecycle signals so a frame that arrives before its waiter is
 * installed is still observed. A per-start generation prevents a dying worker
 * from resolving the replacement worker's startup.
 */
export class WikiWorkerLifecycleTracker {
  private readonly bootDeferred = createDeferred();
  private readonly subscriberReadyDeferred = createDeferred();
  private bootSettled = false;
  private subscriberReadySettled = false;

  public readonly booted = this.bootDeferred.promise;
  public readonly subscriberReady = this.subscriberReadyDeferred.promise;

  constructor(
    private readonly workspaceID: string,
    private readonly generation: string,
  ) {}

  public accept(rawMessage: unknown): boolean {
    const unwrapped = unwrapMessage(rawMessage);
    if (!isWikiWorkerLifecycleMessage(unwrapped)) return false;
    if (unwrapped.workspaceID !== this.workspaceID || unwrapped.generation !== this.generation) return false;

    switch (unwrapped.action) {
      case 'subscriber-ready': {
        if (!this.subscriberReadySettled) {
          this.subscriberReadySettled = true;
          this.subscriberReadyDeferred.resolve();
        }
        break;
      }
      case 'booted': {
        if (!this.bootSettled) {
          this.bootSettled = true;
          this.bootDeferred.resolve();
        }
        break;
      }
      case 'boot-error': {
        if (!this.bootSettled) {
          this.bootSettled = true;
          this.bootDeferred.reject(new Error(unwrapped.error ?? `Wiki ${this.workspaceID} failed to boot`));
        }
        break;
      }
    }
    return true;
  }

  public fail(error: Error): void {
    if (!this.subscriberReadySettled) {
      this.subscriberReadySettled = true;
      this.subscriberReadyDeferred.reject(error);
    }
    if (!this.bootSettled) {
      this.bootSettled = true;
      this.bootDeferred.reject(error);
    }
  }
}

export async function releaseWorkerServicesAfterSubscriberReady(
  tracker: WikiWorkerLifecycleTracker,
  notifyServicesReady: () => Promise<void>,
  subscriberTimeoutMs = 10_000,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      tracker.subscriberReady,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Wiki worker subscriber ACK timed out after ${subscriberTimeoutMs} ms`));
        }, subscriberTimeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  await notifyServicesReady();
}

export function createWikiWorkerLifecycleMessage(
  action: WikiWorkerLifecycleAction,
  generation: string,
  workspaceID: string,
  error?: string,
): WikiWorkerLifecycleMessage {
  return {
    type: WIKI_WORKER_LIFECYCLE_MESSAGE_TYPE,
    action,
    generation,
    workspaceID,
    ...(error === undefined ? {} : { error }),
  };
}
