import type { Worker as NodeWorker } from 'node:worker_threads';
// @ts-expect-error - Vite worker import with ?nodeWorker query
import MemeLoopWorkerFactory from './memeloopWorker?nodeWorker';

export default MemeLoopWorkerFactory as unknown as () => NodeWorker;
