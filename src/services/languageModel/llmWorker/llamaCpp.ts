import type { LLama } from '@llama-node/llama-cpp';
import type { LLM } from 'llama-node';
import type { LoadConfig } from 'llama-node/dist/llm/llama-cpp';
import { Observable } from 'rxjs';
import { ILanguageModelWorkerResponse, LLamaInvocation } from '../interface';

let runnerInstance: undefined | LLM<LLama, LoadConfig, LLamaInvocation>;
const DEFAULT_TIMEOUT_DURATION = 1000 * 30;
export async function loadLLama(
  loadConfigOverwrite: Partial<LoadConfig> & Pick<LoadConfig, 'modelPath'>,
) {
  const { LLM } = await import('llama-node');
  // use dynamic import cjs version to fix https://github.com/andywer/threads.js/issues/478
  const { LLamaCpp } = await import('llama-node/dist/llm/llama-cpp.cjs');
  runnerInstance = new LLM(LLamaCpp);
  const loadConfig: LoadConfig = {
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
  await runnerInstance.load(loadConfig);
  return runnerInstance;
}
export function unloadLLama() {
  runnerInstance = undefined;
}
const runnerAbortControllers = new Map<string, AbortController>();
export function runLLama(
  options: { completionOptions: Partial<LLamaInvocation> & { prompt: string }; conversationID: string; loadConfig: Partial<LoadConfig> & Pick<LoadConfig, 'modelPath'> },
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, completionOptions, loadConfig } = options;

  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.runLLama' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    void (async function runLLamaObservableIIFE() {
      if (runnerInstance === undefined) {
        runnerInstance = await loadLLama(loadConfig);
      }
      try {
        let respondTimeout: NodeJS.Timeout | undefined;
        const abortController = new AbortController();
        const updateTimeout = () => {
          clearTimeout(respondTimeout);
          respondTimeout = setTimeout(() => {
            abortController.abort();
            runnerAbortControllers.delete(conversationID);
            subscriber.complete();
          }, DEFAULT_TIMEOUT_DURATION);
        };
        updateTimeout();
        subscriber.next({ message: 'ready to createCompletion', ...loggerCommonMeta });
        runnerAbortControllers.set(conversationID, abortController);
        await runnerInstance.createCompletion(
          {
            nThreads: 4,
            nTokPredict: 2048,
            topK: 40,
            topP: 0.1,
            temp: 0.2,
            repeatPenalty: 1.5,
            ...completionOptions,
          },
          (response) => {
            const { completed, token } = response;
            updateTimeout();
            subscriber.next({ type: 'result', token, id: conversationID });
            if (completed) {
              clearTimeout(respondTimeout);
              runnerAbortControllers.delete(conversationID);
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
        runnerAbortControllers.delete(conversationID);
        subscriber.complete();
      }
    })();
  });
}
export function abortLLama(conversationID: string) {
  const abortController = runnerAbortControllers.get(conversationID);
  if (abortController !== undefined) {
    abortController.abort();
  }
}
