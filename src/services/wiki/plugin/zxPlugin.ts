import type { ITiddlyWiki } from '@tiddlygit/tiddlywiki';
import vm, { Context } from 'vm';
import _ from 'lodash';

export const TW_SCRIPT_SEPARATOR = '/** tw */';
/**
 * Script that can access nodejs API and that can access $tw API can only live in different execution contexts. We treat some log with TW_SCRIPT_SEPARATOR from zx execution as a script that can be executed in $tw context.
 * @param scriptContent string that is possible being script that user want to eval. But may have other logs, so we use TW_SCRIPT_SEPARATOR to separate them apart.
 * @returns
 */
export function extractTWContextScripts(scriptContent: string): Array<{ content: string; messageType: 'script' | 'log' }> {
  return (
    scriptContent
      .split(TW_SCRIPT_SEPARATOR)
      /** 0 | 1 | 2 | 3, means only index is odd, the script is surrounded by the separator */
      .map((script, index) => (index % 2 === 1 ? { messageType: 'script', content: script } : { messageType: 'log', content: script }))
  );
}

/**
 * Execute script in $tw context. Using nodejs's vm module, through it is slower than eval, but it allows us define global variables like `console` and `$tw`.
 * @param scriptContent string to eval
 * @param context contains results to log, and the vm context that contains the global $tw.
 * @returns
 */
export function executeScriptInTWContext(scriptContent: string, context: ITWVMContext): string[] {
  try {
    // log vm return result to user
    context.executionResults.push(`return ${String(vm.runInContext(scriptContent, context.context))}`);
  } catch (error) {
    context.executionResults.push(`${(error as Error).name}: ${(error as Error).message} ${(error as Error).stack ?? ''}`);
  }
  return context.executionResults;
}

export interface ITWVMContext {
  context: Context;
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
          executionResults.push(messageArguments.map((item) => String(item)).join('\n'));
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
