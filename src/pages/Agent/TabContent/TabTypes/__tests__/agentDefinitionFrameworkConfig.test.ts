import type { AgentDefinition, AgentFrameworkConfig } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { applyEditedAgentFrameworkConfig, createEditableAgentFrameworkConfig } from '../agentDefinitionFrameworkConfig';

const definition = (): AgentDefinition => ({
  id: 'memeloop:general-assistant',
  name: 'Customized assistant',
  description: 'Keep me',
  version: '1',
  systemPrompt: '',
  tools: [],
  agentFrameworkID: 'agent-tool-loop',
  agentFrameworkConfig: {
    prompts: [{ id: 'system', enabled: true, text: 'Custom prompt' }],
    plugins: [{ id: 'wiki-search-agent-tool', toolId: 'wikiSearch', enabled: false }],
  },
  agentTools: [
    { toolId: 'wikiSearch', enabled: true, parameters: { wikiSearchParam: { sourceType: 'custom-wiki' } } },
    { toolId: 'customTool', enabled: false },
  ],
});

describe('agent definition framework config editing', () => {
  it('materializes host tools while retaining configured parameters', () => {
    const editable = createEditableAgentFrameworkConfig(definition());
    const wikiSearch = editable.plugins?.find(plugin => plugin.toolId === 'wikiSearch');
    const customTool = editable.plugins?.find(plugin => plugin.toolId === 'customTool');

    expect(wikiSearch).toMatchObject({
      enabled: true,
      wikiSearchParam: { sourceType: 'custom-wiki' },
    });
    expect(customTool).toMatchObject({ enabled: false });
  });

  it('persists the complete edited config and explicitly clears host tool fallback', () => {
    const current = definition();
    const editedConfig: AgentFrameworkConfig = {
      ...createEditableAgentFrameworkConfig(current),
      plugins: createEditableAgentFrameworkConfig(current).plugins?.map(plugin => plugin.toolId === 'wikiSearch' ? { ...plugin, enabled: false } : plugin),
    };
    const edited = applyEditedAgentFrameworkConfig(current, editedConfig);

    expect(edited.name).toBe('Customized assistant');
    expect(edited.description).toBe('Keep me');
    expect(edited.agentFrameworkConfig?.plugins?.find(plugin => plugin.toolId === 'wikiSearch')?.enabled).toBe(false);
    expect(edited.agentTools).toEqual([]);
  });
});
