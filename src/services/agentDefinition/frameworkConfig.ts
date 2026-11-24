import type { AgentDefinition, AgentDefinitionToolConfig, AgentFrameworkConfig, LoopProfile } from 'memeloop';
import { mergeAgentToolsIntoFrameworkConfig } from 'memeloop/tools';

/** Keep Desktop's Wiki-backed todo as the only advertised todo capability. */
export function adaptDesktopAgentDefinitionTools(
  definition: AgentDefinition & Pick<LoopProfile, 'plugins'>,
): AgentDefinition & Pick<LoopProfile, 'plugins'> {
  return {
    ...definition,
    // The host prompt plugin keeps its persisted todoWrite configuration, but
    // registers manage-todo. Core's native todoWrite requires a different store.
    tools: definition.tools.filter(toolId => toolId !== 'todoWrite'),
    ...(definition.plugins === undefined ? {} : {
      plugins: definition.plugins.filter(plugin => plugin.id !== 'builtin:todo-write'),
    }),
  };
}

/**
 * Materialize Desktop-owned tool declarations without discarding an editor
 * override already persisted in the framework config. Core's generic merge is
 * declaration-first: host tools fill the config and take their configured
 * default state. Desktop's editor is the authority for an explicit plugin
 * state, including `enabled: false`.
 */
export function mergeDesktopAgentToolsIntoFrameworkConfig(
  frameworkConfig: AgentFrameworkConfig | undefined,
  agentTools: AgentDefinitionToolConfig[] | undefined,
): AgentFrameworkConfig {
  const merged = mergeAgentToolsIntoFrameworkConfig(frameworkConfig, agentTools);
  const configuredPlugins = Array.isArray(frameworkConfig?.plugins) ? frameworkConfig.plugins : [];
  const configuredByToolId = new Map<string, Record<string, unknown>>();

  for (const plugin of configuredPlugins) {
    if (!isToolPlugin(plugin)) continue;
    configuredByToolId.set(plugin.toolId, plugin);
  }

  return {
    ...merged,
    plugins: merged.plugins.map(plugin => {
      if (!isToolPlugin(plugin)) return plugin;
      const configured = configuredByToolId.get(plugin.toolId);
      return configured === undefined ? plugin : { ...plugin, ...configured };
    }),
  };
}

/** Tool declarations must use the same enablement decision as prompt plugins. */
export function disabledDesktopAgentToolIds(frameworkConfig: AgentFrameworkConfig): ReadonlySet<string> {
  return new Set(
    frameworkConfig.plugins
      .filter(plugin => isToolPlugin(plugin) && plugin.enabled === false)
      .map(plugin => plugin.toolId),
  );
}

function isToolPlugin(value: unknown): value is Record<string, unknown> & { toolId: string } {
  return typeof value === 'object' && value !== null &&
    typeof (value as { toolId?: unknown }).toolId === 'string' &&
    (value as { toolId: string }).toolId.length > 0;
}
