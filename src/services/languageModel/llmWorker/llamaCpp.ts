import type { LLama } from '@llama-node/llama-cpp';
import type { LLM } from 'llama-node';
import type { LoadConfig } from 'llama-node/dist/llm/llama-cpp';
import { Observable, type Subscriber } from 'rxjs';
import { ILanguageModelWorkerResponse, LLamaInvocation } from '../interface';
import { DEFAULT_TIMEOUT_DURATION } from './constants';

let runnerInstance: undefined | LLM<LLama, LoadConfig, LLamaInvocation>;
export async function loadLLama(
  loadConfigOverwrite: Partial<LoadConfig> & Pick<LoadConfig, 'modelPath'>,
  subscriber?: Subscriber<ILanguageModelWorkerResponse>,
) {
  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.loadLLama' }, id: 'loadLLama' };
  subscriber?.next({ message: 'async importing library', ...loggerCommonMeta });
  const { LLM } = await import('llama-node');
  // use dynamic import cjs version to fix https://github.com/andywer/threads.js/issues/478
  const { LLamaCpp } = await import('llama-node/dist/llm/llama-cpp.cjs');
  subscriber?.next({ message: 'library loaded, new LLM now', ...loggerCommonMeta });
  try {
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
    subscriber?.next({ message: 'prepared to load instance', ...loggerCommonMeta, meta: { ...loggerCommonMeta.meta, loadConfigOverwrite } });
    await runnerInstance.load(loadConfig);
    subscriber?.next({ message: 'instance loaded', ...loggerCommonMeta });
    return runnerInstance;
  } catch (error) {
    unloadLLama();
    throw error;
  }
}
export function unloadLLama() {
  runnerInstance = undefined;
}
const runnerAbortControllers = new Map<string, AbortController>();
export function runLLama(
  options: { completionOptions: Partial<LLamaInvocation> & { prompt: string }; conversationID: string; loadConfig: Partial<LoadConfig> & Pick<LoadConfig, 'modelPath'> },
  texts: { timeout: string },
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, completionOptions, loadConfig } = options;

  const loggerCommonMeta = { level: 'debug' as const, meta: { function: 'llmWorker.runLLama' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    void (async function runLLamaObservableIIFE() {
      try {
        if (runnerInstance === undefined) {
          runnerInstance = await loadLLama(loadConfig, subscriber);
        }
      } catch (error) {
        subscriber.error(error);
        return;
      }
      try {
        let respondTimeout: NodeJS.Timeout | undefined;
        const abortController = new AbortController();
        const updateTimeout = () => {
          clearTimeout(respondTimeout);
          respondTimeout = setTimeout(() => {
            abortController.abort();
            runnerAbortControllers.delete(conversationID);
            subscriber.next({ type: 'result', token: texts.timeout, id: conversationID });
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
        runnerAbortControllers.delete(conversationID);
        subscriber.error(error);
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
