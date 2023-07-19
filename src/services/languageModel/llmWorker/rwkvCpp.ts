import type { Rwkv } from '@llama-node/rwkv-cpp';
import type { LLM } from 'llama-node';
import type { LoadConfig } from 'llama-node/dist/llm/rwkv-cpp';
import { Observable, type Subscriber } from 'rxjs';
import { ILanguageModelWorkerResponse, RwkvInvocation } from '../interface';
import { DEFAULT_TIMEOUT_DURATION } from './constants';

let runnerInstance: undefined | LLM<Rwkv, LoadConfig, RwkvInvocation>;
export async function loadRwkv(
  loadConfigOverwrite: Partial<LoadConfig> & Pick<LoadConfig, 'modelPath' | 'tokenizerPath'>,
  subscriber?: Subscriber<ILanguageModelWorkerResponse>,
) {
  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.loadRwkv' }, id: 'loadRwkv' };
  subscriber?.next({ message: 'async importing library', ...loggerCommonMeta });
  const { LLM } = await import('llama-node');
  // use dynamic import cjs version to fix https://github.com/andywer/threads.js/issues/478
  const { RwkvCpp } = await import('llama-node/dist/llm/rwkv-cpp.cjs');
  subscriber?.next({ message: 'library loaded, new LLM now', ...loggerCommonMeta });
  try {
    runnerInstance = new LLM(RwkvCpp);
    const loadConfig: LoadConfig = {
      enableLogging: true,
      nThreads: 4,
      ...loadConfigOverwrite,
    };
    subscriber?.next({ message: 'prepared to load instance', ...loggerCommonMeta, meta: { ...loggerCommonMeta.meta, loadConfigOverwrite } });
    await runnerInstance.load(loadConfig);
    subscriber?.next({ message: 'instance loaded', ...loggerCommonMeta });
    return runnerInstance;
  } catch (error) {
    unloadRwkv();
    throw error;
  }
}
export function unloadRwkv() {
  runnerInstance = undefined;
}
const runnerAbortControllers = new Map<string, AbortController>();
export function runRwkv(
  options: {
    completionOptions: Partial<RwkvInvocation> & { prompt: string };
    conversationID: string;
    loadConfig: Partial<LoadConfig> & Pick<LoadConfig, 'modelPath' | 'tokenizerPath'>;
  },
  texts: { timeout: string },
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, completionOptions, loadConfig } = options;

  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.runRwkv' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    void (async function runRwkvObservableIIFE() {
      try {
        if (runnerInstance === undefined) {
          runnerInstance = await loadRwkv(loadConfig, subscriber);
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
            maxPredictLength: 2048,
            topP: 0.1,
            temp: 0.1,
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
export function abortRwkv(conversationID: string) {
  const abortController = runnerAbortControllers.get(conversationID);
  if (abortController !== undefined) {
    abortController.abort();
  }
}
