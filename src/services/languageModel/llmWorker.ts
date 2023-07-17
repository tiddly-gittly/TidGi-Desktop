/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import type { LLM } from 'llama-node';
import type { LoadConfig as LLamaLoadConfig } from 'llama-node/dist/llm/llama-cpp';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';
import { ILanguageModelWorkerResponse, ILLAmaCompletionOptions } from './interface';

let llama: undefined | LLM;
const DEFAULT_TIMEOUT_DURATION = 1000 * 30;
async function loadLLama(
  loadConfigOverwrite: Partial<LLamaLoadConfig> & { modelPath: string },
) {
  const { LLM } = await import('llama-node');
  // use dynamic import cjs version to fix https://github.com/andywer/threads.js/issues/478
  const { LLamaCpp } = await import('llama-node/dist/llm/llama-cpp.cjs');
  llama = new LLM(LLamaCpp);
  const loadConfig: LLamaLoadConfig = {
    enableLogging: true,
    nCtx: 1024,
    seed: 0,
    f16Kv: false,
    logitsAll: false,
    vocabOnly: false,
    useMlock: false,
    embedding: false,
    useMmap: true,
    nGpuLayers: 0,
    ...loadConfigOverwrite,
  };
  await llama.load(loadConfig);
}
function unloadLLama() {
  llama = undefined;
}
const llamaAbortControllers = new Map<string, AbortController>();
function runLLama(
  options: { completionOptions?: ILLAmaCompletionOptions; conversationID: string; loadConfig: Partial<LLamaLoadConfig> & { modelPath: string } },
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, completionOptions, loadConfig } = options;

  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.runLLama' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    void (async function runLLamaObservableIIFE() {
      if (llama === undefined) {
        await loadLLama(loadConfig);
        return;
      }
      try {
        let respondTimeout: NodeJS.Timeout | undefined;
        const abortController = new AbortController();
        const updateTimeout = () => {
          clearTimeout(respondTimeout);
          respondTimeout = setTimeout(() => {
            abortController.abort();
            llamaAbortControllers.delete(conversationID);
            subscriber.complete();
          }, DEFAULT_TIMEOUT_DURATION);
        };
        updateTimeout();
        subscriber.next({ message: 'ready to createCompletion', ...loggerCommonMeta });
        llamaAbortControllers.set(conversationID, abortController);
        await llama.createCompletion(
          {
            nThreads: 4,
            nTokPredict: 2048,
            topK: 40,
            topP: 0.1,
            temp: 0.2,
            // repeatPenalty: 1,
            ...completionOptions,
          },
          (response) => {
            const { completed, token } = response;
            updateTimeout();
            subscriber.next({ type: 'result', token, id: conversationID });
            if (completed) {
              clearTimeout(respondTimeout);
              llamaAbortControllers.delete(conversationID);
              subscriber.complete();
            }
          },
          abortController.signal,
        );
        subscriber.next({ message: 'createCompletion completed', ...loggerCommonMeta });
      } catch (error) {
        if (error instanceof Error) {
          subscriber.next({ level: 'error', error, id: conversationID });
        } else {
          subscriber.next({ level: 'error', error: new Error(String(error)), id: conversationID });
        }
        llamaAbortControllers.delete(conversationID);
        subscriber.complete();
      }
    })();
  });
}
function abortLLama(conversationID: string) {
  const abortController = llamaAbortControllers.get(conversationID);
  if (abortController !== undefined) {
    abortController.abort();
  }
}

const llmWorker = { loadLLama, unloadLLama, runLLama, abortLLama };
export type LLMWorker = typeof llmWorker;
expose(llmWorker);
