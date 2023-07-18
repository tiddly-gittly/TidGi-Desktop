import type { Rwkv } from '@llama-node/rwkv-cpp';
import type { LLM } from 'llama-node';
import type { LoadConfig } from 'llama-node/dist/llm/rwkv-cpp';
import { Observable } from 'rxjs';
import { ILanguageModelWorkerResponse, RwkvInvocation } from '../interface';

let runnerInstance: undefined | LLM<Rwkv, LoadConfig, RwkvInvocation>;
const DEFAULT_TIMEOUT_DURATION = 1000 * 30;
export async function loadRwkv(
  loadConfigOverwrite: Partial<LoadConfig> & Pick<LoadConfig, 'modelPath' | 'tokenizerPath'>,
) {
  const { LLM } = await import('llama-node');
  // use dynamic import cjs version to fix https://github.com/andywer/threads.js/issues/478
  const { RwkvCpp } = await import('llama-node/dist/llm/rwkv-cpp.cjs');
  runnerInstance = new LLM(RwkvCpp);
  const loadConfig: LoadConfig = {
    enableLogging: true,
    nThreads: 4,
    ...loadConfigOverwrite,
  };
  await runnerInstance.load(loadConfig);
  return runnerInstance;
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
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, completionOptions, loadConfig } = options;

  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.runRwkv' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    void (async function runRwkvObservableIIFE() {
      if (runnerInstance === undefined) {
        runnerInstance = await loadRwkv(loadConfig);
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
export function abortRwkv(conversationID: string) {
  const abortController = runnerAbortControllers.get(conversationID);
  if (abortController !== undefined) {
    abortController.abort();
  }
}
