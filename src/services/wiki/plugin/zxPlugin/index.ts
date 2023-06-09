/**
 * Can't use logger in this file, because it runs in the worker.
 */
import type { ITiddlyWiki } from '@tiddlygit/tiddlywiki';
import { fork } from 'child_process';
import { writeFile } from 'fs-extra';
import _ from 'lodash';
import type { Subscriber } from 'rxjs';
import vm, { Context } from 'vm';
import { IZxWorkerMessage, ZxWorkerControlActions } from '../../interface';
import {
  extractVariablesFromExecutionLog,
  getSerializeAllVariablesInContextToLogSnippet,
  getSerializeAllVariablesInContextToReturnSnippet,
  IVariableContext,
  type IVariableContextList,
  VARIABLES_MAP_LOG_PREFIX,
} from './passVariableBetweenContext';

export * from './passVariableBetweenContext';

export async function executeScriptInZxScriptContext(
  paths: { filePathToExecute: string; zxPath: string },
  observer: Subscriber<IZxWorkerMessage>,
  content?: string,
  variableContextList?: IVariableContextList,
) {
  const { filePathToExecute, zxPath } = paths;
  try {
    const execution = fork(zxPath, [filePathToExecute], { silent: true });
    if (content !== undefined) {
      const contextWithVariableExtraction = getSerializeAllVariablesInContextToLogSnippet(content);
      await writeFile(filePathToExecute, contextWithVariableExtraction);
    }

    execution.on('close', function(code) {
      observer.next({ type: 'control', actions: ZxWorkerControlActions.ended, message: `child process exited with code ${String(code)}` });
    });
    /**
     * zx script may have multiple console.log, we need to extract some of them and execute them in the $tw context (`executeScriptInTWContext`). And send some of them back to frontend.
     */
    execution.stdout?.on('data', (stdout: Buffer) => {
      const message = String(stdout);
      if (message.startsWith(VARIABLES_MAP_LOG_PREFIX)) {
        // deserialize variables from zx script's context, and prepare to execute them in the next $tw context.
        const variables = extractVariablesFromExecutionLog(message);
        variableContextList?.push(variables);
        // this message is very long, and not human-readable, should not send back to frontend.
        return;
      }
      // send back to frontend.
      observer.next({ type: 'stdout', message });
    });
    execution.stderr?.on('data', (stdout: Buffer) => {
      observer.next({ type: 'stderr', message: String(stdout) });
    });
    execution.on('error', (error) => {
      observer.next({ type: 'stderr', message: `${error.message} ${error.stack ?? ''}` });
    });
  } catch (error) {
    const message = `zx script's executeZxScriptIIFE() failed with error ${(error as Error).message} ${(error as Error).stack ?? ''}`;
    observer.next({ type: 'control', actions: ZxWorkerControlActions.error, message });
  }
}

/**
 * Execute script in $tw context. Using nodejs's vm module, through it is slower than eval, but it allows us define global variables like `console` and `$tw`.
 * @param scriptContent string to eval
 * @param context contains results to log, and the vm context that contains the global $tw.
 * @returns
 */
export function executeScriptInTWContext(
  scriptContent: string,
  observer: Subscriber<IZxWorkerMessage>,
  wikiInstance: ITiddlyWiki,
  variableContextList: IVariableContextList,
): void {
  // execute code in the $tw context
  const context = getTWVmContext(wikiInstance);
  try {
    // prevent user add custom "return" statement that will break the script.
    const scriptContentWithoutReturn = scriptContent.split('\n').filter((line) => !line.trim().startsWith('return')).join('\n');
    if (scriptContentWithoutReturn.length < scriptContent.length) {
      context.executionResults.push('Error: return statement is not allowed in the script. Auto removed.');
    }
    const scriptContentWithVariable = getSerializeAllVariablesInContextToReturnSnippet(scriptContentWithoutReturn);
    const variables: unknown = vm.runInContext(scriptContentWithVariable, context.context);
    if (typeof variables === 'object' && variables !== undefined && variables !== null) {
      variableContextList.push(variables as IVariableContext);
    }
  } catch (error) {
    context.executionResults.push(`${(error as Error).name}: ${(error as Error).message} ${(error as Error).stack ?? ''}`);
  }
  // vm execution is Sync, so we can't get streambed result. return all console.log messages to user at once.
  const message = context.executionResults.join('\n\n');
  observer.next({ type: 'stdout', message });
}

export const TW_SCRIPT_SEPARATOR = '/** tw */';
/**
 * Script that can access nodejs API and that can access $tw API can only live in different execution contexts. We treat some log with TW_SCRIPT_SEPARATOR from zx execution as a script that can be executed in $tw context.
 * @param scriptContent string that user want to eval
 * @returns
 */
export function extractTWContextScripts(scriptContent: string): Array<{ content: string; context: 'zx' | 'tw-server' }> {
  return (
    scriptContent
      .split(TW_SCRIPT_SEPARATOR)
      /** 0 | 1 | 2 | 3, means only index is odd, the script is surrounded by the separator, which means it executes in tw-server */
      .map((script, index) => (index % 2 === 1 ? { context: 'tw-server' as const, content: script } : { context: 'zx' as const, content: script }))
      .filter(({ content }) => content.trim().length > 0)
  );
}

export interface ITWVMContext {
  /**
   * VM module context
   */
  context: Context;
  /**
   * Result from proxy console.log
   */
  executionResults: string[];
}

/**
 * Get context that has global variables like `console` and `$tw`, and a result output buffer that contains result from the `console`.
 * @returns
 */
export function getTWVmContext(wikiInstance: ITiddlyWiki): ITWVMContext {
  const executionResults: string[] = [];
  const proxyConsole = new Proxy(
    {},
    {
      get: (target, propertyName, receiver) => {
        return (...messageArguments: unknown[]): void => {
          executionResults.push(messageArguments.map(String).join('\n'));
        };
      },
    },
  );
  const context = vm.createContext({
    console: proxyConsole,
    $tw: wikiInstance,
    _,
  });

  return { context, executionResults };
}
