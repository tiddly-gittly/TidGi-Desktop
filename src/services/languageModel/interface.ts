import { LanguageModelChannel } from '@/constants/channels';
import type { Generate as LLamaInvocation } from '@llama-node/llama-cpp';
import type { RwkvInvocation } from '@llama-node/rwkv-cpp';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { LoadConfig as LLamaLoadConfig } from 'llama-node/dist/llm/llama-cpp';
import type { LoadConfig as RwkvLoadConfig } from 'llama-node/dist/llm/rwkv-cpp';
import type { Observable } from 'rxjs';

export enum LanguageModelRunner {
  llamaCpp = 'llama.cpp',
  llmRs = 'llm-rs',
  rwkvCpp = 'rwkv.cpp',
}
export interface ILanguageModelPreferences {
  /**
   * Each runner can load different models. This is the default model file name for each runner.
   * @url https://github.com/Atome-FE/llama-node#supported-models
   */
  defaultModel: {
    [LanguageModelRunner.llmRs]: string;
    [LanguageModelRunner.llamaCpp]: string;
    [LanguageModelRunner.rwkvCpp]: string;
  };
  /**
   * If a llm stop responding for this long, we will kill the conversation. This basically means it stopped responding.
   */
  timeoutDuration: number;
}

export interface ILLMResultBase {
  /**
   * Conversation id.
   * Can use this to stop a generation.
   * Also this worker is shared across all workspaces, so you can use this to identify which window is the result for.
   */
  id: string;
}
export type ILanguageModelWorkerResponse = INormalLanguageModelLogMessage | ILanguageModelWorkerResult;
export interface INormalLanguageModelLogMessage extends ILLMResultBase {
  /** for error, use `observer.error` instead */
  level: 'debug' | 'warn' | 'info';
  message: string;
  meta: unknown;
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
  completionOptions: Partial<LLamaInvocation> & { prompt: string };
  loadConfig?: Partial<LLamaLoadConfig>;
  modelName?: string;
}
export interface IRunRwkvOptions extends ILLMResultBase {
  completionOptions: Partial<RwkvInvocation> & { prompt: string };
  loadConfig?: Partial<RwkvLoadConfig>;
  modelName?: string;
}

/**
 * Test language model on renderer by:
 * ```js
 * window.observables.languageModel.runLLama$({ prompt: 'A chat between a user and an assistant.\nUSER: You are a helpful assistant. Write a simple hello world in JS.\nASSISTANT:\n', id: '1' }).subscribe({ next: console.log, error: console.error, complete: () => console.warn('completed') })
 * ```
 */

/**
 * Run language model on a shared worker, and queue requests to the worker.
 */
export interface ILanguageModelService {
  abortLanguageModel(runner: LanguageModelRunner, id: string): Promise<void>;
  runLanguageModel$(runner: LanguageModelRunner.llamaCpp, options: IRunLLAmaOptions): Observable<ILLMResultPart>;
  runLanguageModel$(runner: LanguageModelRunner.rwkvCpp, options: IRunRwkvOptions): Observable<ILLMResultPart>;
}
export const LanguageModelServiceIPCDescriptor = {
  channel: LanguageModelChannel.name,
  properties: {
    abortLanguageModel: ProxyPropertyType.Function,
    runLanguageModel$: ProxyPropertyType.Function$,
  },
};

export type { Generate as LLamaInvocation } from '@llama-node/llama-cpp';
export type { RwkvInvocation } from '@llama-node/rwkv-cpp';
