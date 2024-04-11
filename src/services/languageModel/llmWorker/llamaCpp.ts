import debounce from 'lodash/debounce';
import { getLlama, Llama, LlamaChatSession, LlamaContext, LlamaContextSequence, LlamaModel, LlamaModelOptions } from 'node-llama-cpp';
import { Observable, type Subscriber } from 'rxjs';
import { ILanguageModelWorkerResponse, IRunLLAmaOptions } from '../interface';
import { DEFAULT_TIMEOUT_DURATION } from './constants';

let llamaInstance: undefined | Llama;
let modalInstance: undefined | LlamaModel;
let contextInstance: undefined | LlamaContext;
let contextSequenceInstance: undefined | LlamaContextSequence;
export async function loadLLamaAndModal(
  loadConfigOverwrite: Partial<LlamaModelOptions> & Pick<LlamaModelOptions, 'modelPath'>,
  conversationID: string,
  subscriber: Subscriber<ILanguageModelWorkerResponse>,
) {
  const loggerCommonMeta = { level: 'info' as const, meta: { function: 'llmWorker.loadLLama' }, id: 'loadLLama' };
  // TODO: maybe use dynamic import cjs version to fix https://github.com/andywer/threads.js/issues/478 ? If get `Timeout: Did not receive an init message from worker`.
  // subscriber.next({ message: 'async importing library', ...loggerCommonMeta });
  subscriber.next({ message: 'library loaded, new LLM now', ...loggerCommonMeta });
  try {
    llamaInstance = await getLlama({
      skipDownload: true,
      vramPadding: 0,
      logger: (level, message) => {
        subscriber.next({ message, ...loggerCommonMeta });
      },
    });
    subscriber.next({ message: 'prepared to load modal', ...loggerCommonMeta, meta: { ...loggerCommonMeta.meta, loadConfigOverwrite } });
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
    modalInstance = await llamaInstance.loadModel(loadConfig);
    subscriber.next({ message: 'instance loaded', ...loggerCommonMeta });
    return modalInstance;
  } catch (error) {
    await unloadLLama();
    throw error;
  }
}
export async function unloadLLama() {
  await contextInstance?.dispose();
  contextSequenceInstance?.dispose();
  await modalInstance?.dispose();
  await llamaInstance?.dispose();
  contextSequenceInstance = undefined;
  llamaInstance = undefined;
  modalInstance = undefined;
}
const runnerAbortControllers = new Map<string, AbortController>();
export function runLLama(
  options: {
    completionOptions: IRunLLAmaOptions['completionOptions'];
    conversationID: IRunLLAmaOptions['id'];
    loadConfig: IRunLLAmaOptions['loadConfig'];
  },
  texts: { disposed: string; timeout: string },
): Observable<ILanguageModelWorkerResponse> {
  const { conversationID, completionOptions, loadConfig } = options;

  const loggerCommonMeta = { level: 'debug' as const, meta: { function: 'llmWorker.runLLama' }, id: conversationID };
  return new Observable<ILanguageModelWorkerResponse>((subscriber) => {
    void (async function runLLamaObservableIIFE() {
      try {
        if (modalInstance === undefined) {
          modalInstance = await loadLLamaAndModal(loadConfig, conversationID, subscriber);
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
          contextInstance = await modalInstance.createContext({
            contextSize: Math.min(4096, modalInstance.trainContextSize),
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
            if (modalInstance === undefined) {
              abortController.abort();
              runnerAbortControllers.delete(conversationID);
              subscriber.next({ type: 'result', token: texts.disposed, id: conversationID });
              subscriber.complete();
              return;
            }
            updateTimeout();
            subscriber.next({ type: 'result', token: modalInstance.detokenize(tokens), id: conversationID });
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
    abortController.abort();
  }
}
