/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import { expose } from 'threads/worker';
import { abortLLama, loadLLama, runLLama, unloadLLama } from './llamaCpp';

const llmWorker = { loadLLama, unloadLLama, runLLama, abortLLama };
export type LLMWorker = typeof llmWorker;
expose(llmWorker);
