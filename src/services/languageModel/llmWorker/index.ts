/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import { expose } from 'threads/worker';
import { abortLLama, loadLLamaAndModel, runLLama, unloadLLama } from './llamaCpp';

const llmWorker = { loadLLama: loadLLamaAndModel, unloadLLama, runLLama, abortLLama };
export type LLMWorker = typeof llmWorker;
expose(llmWorker);
