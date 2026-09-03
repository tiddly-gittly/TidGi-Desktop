import type { AgentDefinition, AgentFrameworkConfig } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { createEditableAgentFrameworkConfig } from '../agentDefinitionFrameworkConfig';

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

  it('keeps the canonical host tool declarations separate from the editable config', () => {
    const current = definition();
    const editable = createEditableAgentFrameworkConfig(current);
    const editedConfig: AgentFrameworkConfig = {
      ...editable,
      plugins: editable.plugins?.map(plugin => plugin.toolId === 'wikiSearch' ? { ...plugin, enabled: false } : plugin),
    };
    const edited: AgentDefinition = {
      ...current,
      agentFrameworkConfig: editedConfig,
    };

    expect(edited.name).toBe('Customized assistant');
    expect(edited.description).toBe('Keep me');
    expect(edited.agentFrameworkConfig?.plugins?.find(plugin => plugin.toolId === 'wikiSearch')?.enabled).toBe(false);
    expect(edited.agentTools).toBe(current.agentTools);
  });
});
