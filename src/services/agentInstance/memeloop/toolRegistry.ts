import type { IToolRegistry, PromptConcatTool } from 'memeloop';

import type { ToolExecutionResult } from '../tools/defineTool';
import { pluginRegistry } from '../tools';

type ToolFn = (arguments_: Record<string, unknown>) => Promise<ToolExecutionResult>;

function createLazyToolLoader(): Map<string, ToolFn> {
  const map = new Map<string, ToolFn>();

  const wikiSearchFn: ToolFn = async (arguments_: Record<string, unknown>) => {
    const { executeWikiSearch } = await import('../tools/wikiSearch');
    return executeWikiSearch(arguments_ as Parameters<typeof executeWikiSearch>[0]);
  };

  map.set('wiki-search', wikiSearchFn);
  map.set('wikiSearch', wikiSearchFn);

  const wikiOperationFn: ToolFn = async (arguments_: Record<string, unknown>) => {
    const { executeWikiOperation } = await import('../tools/wikiOperation');
    return executeWikiOperation(arguments_ as Parameters<typeof executeWikiOperation>[0]);
  };

  map.set('wiki-operation', wikiOperationFn);
  map.set('wikiOperation', wikiOperationFn);

  return map;
}

const lazyToolFn = createLazyToolLoader();

export class MemeLoopDesktopToolRegistry implements IToolRegistry {
  private readonly registryTools = new Map<string, unknown>();

  public registerTool(id: string, impl: unknown): void {
    this.registryTools.set(id, impl);
  }

  public getTool(id: string): unknown {
    const registered = this.registryTools.get(id);
    if (registered !== undefined) return registered;
    return lazyToolFn.get(id);
  }

  public listTools(): string[] {
    return [...new Set([...Array.from(this.registryTools.keys()), ...lazyToolFn.keys()])];
  }

  public getPromptPlugins(): Map<string, PromptConcatTool> {
    return pluginRegistry as unknown as Map<string, PromptConcatTool>;
  }
}
