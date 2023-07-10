/* eslint-disable @typescript-eslint/no-misused-promises */
import 'source-map-support/register';
import { LLM } from 'llama-node';
import { LLamaCpp, LoadConfig as LLamaLoadConfig } from 'llama-node/dist/llm/llama-cpp.js';
import { Observable } from 'rxjs';
import { expose } from 'threads/worker';
import { ILanguageModelWorkerResponse } from './interface';

const DEFAULT_TIMEOUT_DURATION = 1000 * 30;
function runLLama$(
  options: { conversationID: string; modelPath: string; prompt: string },
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, modelPath, prompt } = options;
  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.runLLama$' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    void (async function runLLamaObservableIIFE() {
      try {
        subscriber.next({ message: 'preparing instance and config', ...loggerCommonMeta });
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
        subscriber.next({ message: 'loading config', ...loggerCommonMeta, meta: { config, ...loggerCommonMeta.meta } });
        await llama.load(config);
        let respondTimeout: NodeJS.Timeout | undefined;
        const abortController = new AbortController();
        const updateTimeout = () => {
          clearTimeout(respondTimeout);
          respondTimeout = setTimeout(() => {
            abortController.abort();
            subscriber.complete();
          }, DEFAULT_TIMEOUT_DURATION);
        };
        updateTimeout();
        subscriber.next({ message: 'ready to createCompletion', ...loggerCommonMeta });
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
            subscriber.next({ type: 'result', token, id: conversationID });
            if (completed) {
              clearTimeout(respondTimeout);
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
      }
    })();
  });
}

const llmWorker = { runLLama$ };
export type LLMWorker = typeof llmWorker;
expose(llmWorker);
