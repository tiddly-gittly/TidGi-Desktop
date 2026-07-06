/**
 * Local copy of mergeAgentToolsIntoFrameworkConfig from memeloop.
 *
 * This function is copied here to avoid importing the full `memeloop` package
 * (which includes libp2p and other Node.js dependencies) into the Electron
 * renderer process. The original is at:
 *   memeloop/packages/memeloop/src/tools/hostAgentTools.ts
 *
 * IMPORTANT: Keep this in sync with the upstream implementation.
 * When the upstream changes, update this copy and run the agent E2E tests.
 */

import type { AgentDefinitionToolConfig } from 'memeloop';
import type { AgentFrameworkConfig, PromptPluginConfig } from 'memeloop';

function isPluginConfig(value: unknown): value is Record<string, unknown> & { toolId?: string } {
  return typeof value === 'object' && value !== null;
}

export function mergeAgentToolsIntoFrameworkConfig(
  frameworkConfig: AgentFrameworkConfig | undefined,
  agentTools: AgentDefinitionToolConfig[] | undefined,
): AgentFrameworkConfig {
  const baseConfig = { ...(frameworkConfig ?? {}) };
  const rawPlugins = Array.isArray(baseConfig.plugins) ? baseConfig.plugins : [];
  const pluginByToolId = new Map<string, Record<string, unknown>>();
  const pluginWithoutToolId: unknown[] = [];

  for (const plugin of rawPlugins) {
    if (isPluginConfig(plugin) && typeof plugin.toolId === 'string' && plugin.toolId.length > 0) {
      pluginByToolId.set(plugin.toolId, plugin);
    } else {
      pluginWithoutToolId.push(plugin);
    }
  }

  for (const tool of agentTools ?? []) {
    if (!tool.toolId) continue;
    pluginByToolId.set(tool.toolId, {
      id: `${tool.toolId}-agent-tool`,
      toolId: tool.toolId,
      enabled: tool.enabled ?? true,
      ...(tool.parameters ?? {}),
    });
  }

  return {
    ...baseConfig,
    prompts: Array.isArray(baseConfig.prompts) ? baseConfig.prompts : [],
    response: Array.isArray(baseConfig.response) ? baseConfig.response : undefined,
    plugins: [...pluginWithoutToolId, ...pluginByToolId.values()] as PromptPluginConfig[],
  };
}
