/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import { expose } from 'threads/worker';
import { abortLLama, loadLLama, runLLama, unloadLLama } from './llamaCpp';
import { abortRwkv, loadRwkv, runRwkv, unloadRwkv } from './rwkvCpp';

const llmWorker = { loadLLama, unloadLLama, runLLama, abortLLama, loadRwkv, unloadRwkv, runRwkv, abortRwkv };
export type LLMWorker = typeof llmWorker;
expose(llmWorker);
