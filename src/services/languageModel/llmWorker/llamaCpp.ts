import { LLAMA_PREBUILT_BINS_DIRECTORY } from './preload';

import debounce from 'lodash/debounce';
import { getLlama, Llama, LlamaChatSession, LlamaContext, LlamaContextSequence, LlamaModel, LlamaModelOptions } from 'node-llama-cpp';
import { Observable, Subscriber } from 'rxjs';
import { ILanguageModelWorkerResponse, IRunLLAmaOptions } from '../interface';
import { DEFAULT_TIMEOUT_DURATION } from './constants';

let llamaInstance: undefined | Llama;
let modelInstance: undefined | LlamaModel;
let contextInstance: undefined | LlamaContext;
let contextSequenceInstance: undefined | LlamaContextSequence;
export function loadLLamaAndModel(
  loadConfigOverwrite: Partial<LlamaModelOptions> & Pick<LlamaModelOptions, 'modelPath'>,
  conversationID: string,
): Observable<ILanguageModelWorkerResponse> {
  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.loadLLama' }, id: 'loadLLama' };
  // TODO: maybe use dynamic import cjs version to fix https://github.com/andywer/threads.js/issues/478 ? If get `Timeout: Did not receive an init message from worker`.
  // subscriber.next({ message: 'async importing library', ...loggerCommonMeta });
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    async function loadLLamaAndModelIIFE() {
      subscriber.next({ message: `library loaded, new LLM now with LLAMA_PREBUILT_BINS_DIRECTORY ${LLAMA_PREBUILT_BINS_DIRECTORY}`, ...loggerCommonMeta });
      try {
        llamaInstance = await getLlama({
          skipDownload: true,
          vramPadding: 0,
          build: 'never',
          logger: (level, message) => {
            subscriber.next({ message, ...loggerCommonMeta });
          },
        });
        subscriber.next({ message: 'prepared to load model', ...loggerCommonMeta, meta: { ...loggerCommonMeta.meta, config: JSON.stringify(loadConfigOverwrite) } });
        const onLoadProgress = debounce((percentage: number) => {
          subscriber.next({
            type: 'progress',
            percentage,
            id: conversationID,
          });
        });
        const loadConfig: LlamaModelOptions = {
          onLoadProgress,
          ...loadConfigOverwrite,
        };
        modelInstance = await llamaInstance.loadModel(loadConfig);
        subscriber.next({ message: 'loadLLamaAndModel instance loaded', ...loggerCommonMeta });
        subscriber.complete();
      } catch (error) {
        console.error(error);
        await unloadLLama();
        throw error;
      }
    }
    void loadLLamaAndModelIIFE().catch(error => {
      subscriber.error(error);
    });
  });
}
async function waitLoadLLamaAndModel(
  loadConfigOverwrite: Partial<LlamaModelOptions> & Pick<LlamaModelOptions, 'modelPath'>,
  conversationID: string,
  subscriber: Subscriber<ILanguageModelWorkerResponse>,
): Promise<LlamaModel> {
  return await new Promise((resolve, reject) => {
    loadLLamaAndModel(loadConfigOverwrite, conversationID).subscribe({
      next: subscriber.next.bind(subscriber),
      complete: () => {
        resolve(modelInstance!);
      },
      error: reject,
    });
  });
}

export async function unloadLLama() {
  console.info('unloadLLama');
  await contextInstance?.dispose();
  contextSequenceInstance?.dispose();
  await modelInstance?.dispose();
  await llamaInstance?.dispose();
  contextInstance = undefined;
  contextSequenceInstance = undefined;
  llamaInstance = undefined;
  modelInstance = undefined;
}
const runnerAbortControllers = new Map<string, AbortController>();
export function runLLama(
  options: {
    completionOptions: IRunLLAmaOptions['completionOptions'];
    conversationID: IRunLLAmaOptions['id'];
    loadConfig: IRunLLAmaOptions['loadConfig'] & Pick<LlamaModelOptions, 'modelPath'>;
  },
  texts: { disposed: string; timeout: string },
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, completionOptions, loadConfig } = options;

  const loggerCommonMeta = { level: 'debug' as const, meta: { function: 'llmWorker.runLLama' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    void (async function runLLamaObservableIIFE() {
      try {
        if (modelInstance === undefined) {
          subscriber.next({ message: `waitLoadLLamaAndModel with LLAMA_PREBUILT_BINS_DIRECTORY ${LLAMA_PREBUILT_BINS_DIRECTORY}`, ...loggerCommonMeta });
          modelInstance = await waitLoadLLamaAndModel(loadConfig, conversationID, subscriber);
        } else {
          // tell UI we have model loaded already.
          subscriber.next({
            type: 'progress',
            percentage: 1,
            id: conversationID,
          });
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
        if (contextInstance === undefined) {
          contextInstance = await modelInstance.createContext({
            contextSize: Math.min(4096, modelInstance.trainContextSize),
          });
        }
        if (contextSequenceInstance === undefined) {
          contextSequenceInstance = contextInstance.getSequence();
        }
        const session = new LlamaChatSession({
          contextSequence: contextSequenceInstance,
          autoDisposeSequence: false,
        });
        await session.prompt(completionOptions.prompt, {
          ...completionOptions,
          signal: abortController.signal,
          onToken: (tokens) => {
            if (modelInstance === undefined) {
              abortController.abort();
              runnerAbortControllers.delete(conversationID);
              subscriber.next({ type: 'result', token: texts.disposed, id: conversationID });
              subscriber.complete();
              return;
            }
            updateTimeout();
            subscriber.next({ type: 'result', token: modelInstance.detokenize(tokens), id: conversationID });
          },
        });
        // completed
        clearTimeout(respondTimeout);
        runnerAbortControllers.delete(conversationID);
        subscriber.complete();
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
    try {
      abortController.abort();
      runnerAbortControllers.delete(conversationID);
    } catch (error) {
      const message = `${(error as Error).message} ${(error as Error).stack ?? 'no stack'}`;
      if (message.includes('AbortError')) {
        console.info('abortLLama', conversationID);
      } else {
        throw error;
      }
    }
  }
}
