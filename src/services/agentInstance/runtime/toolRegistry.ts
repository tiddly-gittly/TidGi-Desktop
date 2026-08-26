import { ToolDefinitionRegistry, ToolSchemaRegistry } from 'memeloop';
import type { IToolRegistry, PromptConcatTool, ToolExecutionResult, ToolOperationEffect } from 'memeloop';
import { desktopBuiltinToolDefinitions } from '../tools/builtinToolDefinitions';

type ToolFunction = (arguments_: Record<string, unknown>) => Promise<ToolExecutionResult>;
interface RegisteredTool {
  implementation: unknown;
  parameterSchema?: unknown;
  effect: ToolOperationEffect;
  owner?: symbol;
}

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
  private readonly registryTools = new Map<string, RegisteredTool>();
  private readonly promptPlugins = new Map<string, PromptConcatTool>();
  private readonly schemaRegistry = new ToolSchemaRegistry();
  private readonly definitionRegistry = new ToolDefinitionRegistry(this.promptPlugins, this.schemaRegistry);
  private disposed = false;

  public constructor() {
    try {
      for (const definition of desktopBuiltinToolDefinitions) {
        this.definitionRegistry.registerOwnedToolDefinition(definition);
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public registerTool(
    id: string,
    implementation: unknown,
    parameterSchema?: unknown,
    effect: ToolOperationEffect = 'execute',
  ): void {
    this.assertActive();
    this.assertCallable(id, implementation);
    this.registryTools.set(id, { implementation, parameterSchema, effect });
  }

  /** Ownership-aware registration used by runtime-scoped Core plugins. */
  public registerOwnedTool(
    id: string,
    implementation: unknown,
    parameterSchema?: unknown,
    effect: ToolOperationEffect = 'execute',
  ): () => boolean {
    this.assertActive();
    this.assertCallable(id, implementation);
    if (this.registryTools.has(id)) throw new Error(`Desktop tool already registered: ${id}`);
    const owner = Symbol(id);
    this.registryTools.set(id, { implementation, parameterSchema, effect, owner });
    return () => {
      const current = this.registryTools.get(id);
      if (current?.owner !== owner) return false;
      return this.registryTools.delete(id);
    };
  }

  public unregisterTool(id: string): boolean {
    this.assertActive();
    return this.registryTools.delete(id);
  }

  public hasTool(id: string): boolean {
    this.assertActive();
    return this.registryTools.has(id) || lazyToolFunction.has(id) || this.definitionRegistry.getToolDefinition(id) !== undefined;
  }

  public getTool(id: string): unknown {
    this.assertActive();
    const registered = this.registryTools.get(id);
    if (registered !== undefined) return registered.implementation;
    return lazyToolFunction.get(id);
  }

  public listTools(): string[] {
    this.assertActive();
    return [
      ...new Set([
        ...this.registryTools.keys(),
        ...lazyToolFunction.keys(),
        ...this.definitionRegistry.getAllToolDefinitions().keys(),
      ]),
    ];
  }

  public getToolParameterSchema(id: string): unknown {
    this.assertActive();
    const registered = this.registryTools.get(id);
    return registered?.parameterSchema ?? this.schemaRegistry.getToolParameterSchema(id);
  }

  public getToolMetadata(id: string) {
    this.assertActive();
    return this.schemaRegistry.getToolMetadata(id);
  }

  public getToolEffect(id: string): ToolOperationEffect | undefined {
    this.assertActive();
    return this.registryTools.get(id)?.effect;
  }

  public getPromptPlugins(): Map<string, PromptConcatTool> {
    this.assertActive();
    return this.promptPlugins;
  }

  public getToolSchemaRegistry(): ToolSchemaRegistry {
    this.assertActive();
    return this.schemaRegistry;
  }

  public getToolDefinitionRegistry(): ToolDefinitionRegistry {
    this.assertActive();
    return this.definitionRegistry;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.definitionRegistry.dispose();
    this.schemaRegistry.clear();
    this.promptPlugins.clear();
    this.registryTools.clear();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('desktop_tool_registry_disposed');
  }

  private assertCallable(id: string, implementation: unknown): void {
    if (typeof implementation !== 'function') throw new TypeError(`Desktop tool implementation must be callable: ${id}`);
  }
}
