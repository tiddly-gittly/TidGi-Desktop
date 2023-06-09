/**
 * Can't use logger in this file, because it runs in the worker.
 */
import type { ITiddlyWiki } from '@tiddlygit/tiddlywiki';
import { fork } from 'child_process';
import * as espree from 'espree';
import { writeFile } from 'fs-extra';
import _ from 'lodash';
import type { Subscriber } from 'rxjs';
import vm, { Context } from 'vm';
import { IZxWorkerMessage, ZxWorkerControlActions } from '../interface';

export async function executeScriptInZxScriptContext(paths: { filePathToExecute: string; zxPath: string }, observer: Subscriber<IZxWorkerMessage>, content?: string) {
  const { filePathToExecute, zxPath } = paths;
  try {
    const execution = fork(zxPath, [filePathToExecute], { silent: true });
    if (content !== undefined) {
      await writeFile(filePathToExecute, content);
    }

    execution.on('close', function(code) {
      observer.next({ type: 'control', actions: ZxWorkerControlActions.ended, message: `child process exited with code ${String(code)}` });
    });
    /**
     * zx script may have multiple console.log, we need to extract some of them and execute them in the $tw context (`executeScriptInTWContext`). And send some of them back to frontend.
     */
    execution.stdout?.on('data', (stdout: Buffer) => {
      // send back to frontend.
      observer.next({ type: 'stdout', message: String(stdout) });
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
      .map((script, index) => (index % 2 === 1 ? { context: 'tw-server', content: script } : { context: 'zx', content: script }))
  );
}

/**
 * Execute script in $tw context. Using nodejs's vm module, through it is slower than eval, but it allows us define global variables like `console` and `$tw`.
 * @param scriptContent string to eval
 * @param context contains results to log, and the vm context that contains the global $tw.
 * @returns
 */
export function executeScriptInTWContext(scriptContent: string, observer: Subscriber<IZxWorkerMessage>, wikiInstance: ITiddlyWiki): void {
  // execute code in the $tw context
  const context = getTWVmContext(wikiInstance);
  try {
    const result: unknown = vm.runInContext(scriptContent, context.context);
    // log vm return result to user
    context.executionResults.push(`return ${String(result)}`);
  } catch (error) {
    context.executionResults.push(`${(error as Error).name}: ${(error as Error).message} ${(error as Error).stack ?? ''}`);
  }
  const message = context.executionResults.join('\n\n');
  observer.next({ type: 'stdout', message });
}

export interface EspreeASTRoot {
  body: Body[];
  sourceType: string;
  type: string;
}
export interface Body {
  declarations: EspreeASTVariableDeclarator[];
  kind: string;
  type: string;
}
export interface EspreeASTVariableDeclarator {
  id: EspreeASTId;
  type: string;
}

export interface EspreeASTId {
  name: string;
  type: string;
}
/**
 * Extract variables from script content. We will use these variables to construct a `console.dir` that serialize all these variables, and deserialize them in next code context.
 *
 * Use https://esprima.org/demo/parse.html# as playground to see the AST.
 * @param scriptContent string that is already separated by TW_SCRIPT_SEPARATOR.
 * @returns variables that we need to extract, serialize, and deserialize, then send to next code context
 * @url https://stackoverflow.com/a/25473571/4617295
 */
export function getVariablesFromScript(scriptContent: string): string[] {
  try {
    const tree = espree.parse(scriptContent, { sourceType: 'module' }) as EspreeASTRoot;
    const topLevelVariables = tree.body.filter(node => node.type === 'VariableDeclaration' && node.declarations?.length > 0).flatMap(node =>
      node.declarations.map(declaration => declaration.id.name)
    );
    return topLevelVariables;
  } catch {
    // Can't use logger in this file to log error, because it runs in the worker. Just return empty variable list, let user to guess...
    return [];
  }
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
