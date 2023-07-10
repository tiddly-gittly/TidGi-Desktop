import { WorkflowChannel } from '@/constants/channels';
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
export type IWorkflowWorkerResponse = INormalWorkflowLogMessage | IErrorWorkflowLogMessage | IWorkflowWorkerResult;
export interface INormalWorkflowLogMessage extends ILLMResultBase {
  level: 'debug' | 'warn' | 'info';
  message: string;
  meta: unknown;
}
export interface IErrorWorkflowLogMessage extends ILLMResultBase {
  error: Error;
  level: 'error';
}
export interface IWorkflowWorkerResult extends ILLMResultPart {
  type: 'result';
}

/**
 * Part of generate result.
 */
export interface ILLMResultPart extends ILLMResultBase {
  token: string;
}

export interface ICreateRuntimeOptions extends ILLMResultBase {
  baseDir: string;
  id: string;
  label?: string;
  namespace?: string;
}

/**
 * Test language model on renderer by:
 * ```js
 * window.observables.Workflow.runLLama$({ id: '1' }).subscribe({ next: console.log, error: console.error, complete: () => console.warn('completed') })
 * ```
 */

/**
 * Run language model on a shared worker, and queue requests to the worker.
 */
export interface IWorkflowService {
  createRuntime$(options: ICreateRuntimeOptions): Observable<ILLMResultPart>;
}
export const WorkflowServiceIPCDescriptor = {
  channel: WorkflowChannel.name,
  properties: {
    createRuntime$: ProxyPropertyType.Function$,
  },
};
