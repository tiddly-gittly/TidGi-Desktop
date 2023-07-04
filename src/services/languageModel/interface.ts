import { LanguageModelChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { Observable } from 'rxjs';

export interface ILLMResultBase {
  /**
   * Conversation id.
   * Can use this to stop a generation.
   * Also this worker is shared across all workspaces, so you can use this to identify which window is the result for.
   */
  id: string;
}
export type ILanguageModelWorkerResponse = INormalLanguageModelLogMessage | IErrorLanguageModelLogMessage | ILanguageModelWorkerResult;
export interface INormalLanguageModelLogMessage extends ILLMResultBase {
  level: 'debug' | 'warn' | 'info';
  message: string;
  meta: unknown;
}
export interface IErrorLanguageModelLogMessage extends ILLMResultBase {
  error: Error;
  level: 'error';
}
export interface ILanguageModelWorkerResult extends ILLMResultPart {
  type: 'result';
}

/**
 * Part of generate result.
 */
export interface ILLMResultPart extends ILLMResultBase {
  token: string;
}

export interface IRunLLAmaOptions extends ILLMResultBase {
  modelName?: string;
  prompt: string;
}

/**
 * Test language model on renderer by:
 * ```js
 * window.observables.languageModel.runLLama$({ id: '1' }).subscribe({ next: console.log, error: console.error, complete: () => console.warn('completed') })
 * ```
 */

/**
 * Run language model on a shared worker, and queue requests to the worker.
 */
export interface ILanguageModelService {
  runLLama$(options: IRunLLAmaOptions): Observable<ILLMResultPart>;
}
export const LanguageModelServiceIPCDescriptor = {
  channel: LanguageModelChannel.name,
  properties: {
    runLLama$: ProxyPropertyType.Function$,
  },
};
