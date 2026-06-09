import type { IToolRegistry, PromptConcatTool } from 'memeloop';

import { pluginRegistry } from '../tools';

export class MemeLoopDesktopToolRegistry implements IToolRegistry {
  private readonly registryTools = new Map<string, unknown>();

  public registerTool(id: string, impl: unknown): void {
    this.registryTools.set(id, impl);
  }

  public getTool(id: string): unknown {
    return this.registryTools.get(id);
  }

  public listTools(): string[] {
    return Array.from(this.registryTools.keys());
  }

  public getPromptPlugins(): Map<string, PromptConcatTool> {
    return pluginRegistry as unknown as Map<string, PromptConcatTool>;
  }
}
