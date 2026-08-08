import type { IToolRegistry, PromptConcatTool } from 'memeloop';

import type { ToolExecutionResult } from 'memeloop';
import { pluginRegistry } from '../tools';

type ToolFunction = (arguments_: Record<string, unknown>) => Promise<ToolExecutionResult>;

function createLazyToolLoader(): Map<string, ToolFunction> {
  const map = new Map<string, ToolFunction>();

  const wikiSearchFunction: ToolFunction = async (arguments_: Record<string, unknown>) => {
    const { executeWikiSearch } = await import('../tools/wikiSearch');
    return executeWikiSearch(arguments_ as Parameters<typeof executeWikiSearch>[0]);
  };

  map.set('wiki-search', wikiSearchFunction);
  map.set('wikiSearch', wikiSearchFunction);

  const wikiOperationFunction: ToolFunction = async (arguments_: Record<string, unknown>) => {
    const { executeWikiOperation } = await import('../tools/wikiOperation');
    return executeWikiOperation(arguments_ as Parameters<typeof executeWikiOperation>[0]);
  };

  map.set('wiki-operation', wikiOperationFunction);
  map.set('wikiOperation', wikiOperationFunction);

  return map;
}

const lazyToolFunction = createLazyToolLoader();

export class MemeLoopDesktopToolRegistry implements IToolRegistry {
  private readonly registryTools = new Map<string, unknown>();

  public registerTool(id: string, impl: unknown): void {
    this.registryTools.set(id, impl);
  }

  public getTool(id: string): unknown {
    const registered = this.registryTools.get(id);
    if (registered !== undefined) return registered;
    return lazyToolFunction.get(id);
  }

  public listTools(): string[] {
    return [...new Set([...Array.from(this.registryTools.keys()), ...lazyToolFunction.keys()])];
  }

  public getPromptPlugins(): Map<string, PromptConcatTool> {
    return pluginRegistry as unknown as Map<string, PromptConcatTool>;
  }
}
