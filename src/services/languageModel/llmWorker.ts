/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import { LLM } from 'llama-node';
import { LLamaCpp, LoadConfig as LLamaLoadConfig } from 'llama-node/dist/llm/llama-cpp.js';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';
import { ILanguageModelWorkerResponse } from './interface';

/**
 * If a llm stop responding for this long, we will kill the conversation. This basically means it stopped responding.
 */
const DEFAULT_TIMEOUT_DURATION = 1000 * 30;
function runLLama$(
  options: { conversationID: string; modelPath: string; prompt: string },
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, modelPath, prompt } = options;
  const loggerCommonMeta = { meta: { function: 'llmWorker.runLLama$' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((observer) => {
    void (async function runLLamaObservableIIFE() {
      try {
        observer.next({ level: 'info', message: 'preparing instance and config', ...loggerCommonMeta });
        const llama = new LLM(LLamaCpp);
        const config: LLamaLoadConfig = {
          modelPath,
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
        };
        observer.next({ level: 'info', message: 'loading config', ...loggerCommonMeta, meta: { config, ...loggerCommonMeta.meta } });
        await llama.load(config);
        let respondTimeout: NodeJS.Timeout | undefined;
        const abortController = new AbortController();
        const updateTimeout = () => {
          clearTimeout(respondTimeout);
          respondTimeout = setTimeout(() => {
            abortController.abort();
            observer.complete();
          }, DEFAULT_TIMEOUT_DURATION);
        };
        updateTimeout();
        observer.next({ level: 'info', message: 'ready to createCompletion', ...loggerCommonMeta });
        await llama.createCompletion(
          {
            nThreads: 4,
            nTokPredict: 2048,
            topK: 40,
            topP: 0.1,
            temp: 0.2,
            // repeatPenalty: 1,
            prompt,
          },
          (response) => {
            const { completed, token } = response;
            updateTimeout();
            observer.next({ type: 'result', token, id: conversationID });
            if (completed) {
              // DEBUG: console
              console.log(`completed`);
            }
            if (completed) {
              clearTimeout(respondTimeout);
              observer.complete();
            }
          },
          abortController.signal,
        );
        observer.next({ level: 'info', message: 'createCompletion completed', ...loggerCommonMeta });
      } catch (error) {
        if (error instanceof Error) {
          observer.next({ level: 'error', error, id: conversationID });
        } else {
          observer.next({ level: 'error', error: new Error(String(error)), id: conversationID });
        }
      }
    })();
  });
}

const llmWorker = { runLLama$ };
export type LLMWorker = typeof llmWorker;
expose(llmWorker);
