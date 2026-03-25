export default function MemeLoopWorkerFactoryStub(): Worker {
  const workerLike = {
    on: () => undefined,
    off: () => undefined,
    once: () => undefined,
    postMessage: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    terminate: () => undefined,
  };
  return workerLike as unknown as Worker;
}
