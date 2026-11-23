import { AGENT_TOOL_LOOP_ID, type AgentDefinitionToolConfig } from 'memeloop';
import { nanoid } from 'nanoid';
import { beforeAll, describe, expect, it } from 'vitest';

import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { getDefaultAgentDefinitionId } from '../defaults';
import { mergeDesktopGeneralAssistantTools } from '../index';
import type { IAgentDefinitionService } from '../interface';

describe('Desktop built-in general assistant integration', () => {
  let definitions: IAgentDefinitionService;
  let instances: IAgentInstanceService;

  beforeAll(async () => {
    await container.get<IDatabaseService>(serviceIdentifier.Database).initializeForApp();
    definitions = container.get<IAgentDefinitionService>(serviceIdentifier.AgentDefinition);
    instances = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    await definitions.initialize();
    await instances.initialize();
  });

  it('resolves the fresh bundled definition and new instance with Desktop Wiki capabilities', async () => {
    const definitionId = getDefaultAgentDefinitionId();
    const definition = await definitions.getAgentDef(definitionId);
    // Published Core profiles expose the canonical loopId. Desktop must map
    // it into its persisted editor field so both prompt and plugin forms can
    // request the matching schema.
    expect(definition?.agentFrameworkID).toBe(AGENT_TOOL_LOOP_ID);
    expect(definition?.loopId).toBe(AGENT_TOOL_LOOP_ID);
    expect(instances.getFrameworkConfigSchema(definition?.agentFrameworkID ?? '')).toMatchObject({
      properties: expect.objectContaining({
        prompts: expect.any(Object),
        plugins: expect.any(Object),
      }),
    });
    expect(definition?.agentTools?.map(tool => tool.toolId)).toEqual(expect.arrayContaining([
      'workspacesList',
      'wikiSearch',
      'wikiOperation',
    ]));

    const instance = await instances.createAgent(definitionId, { id: nanoid(), volatile: true });
    expect(instance.agentDefId).toBe(definitionId);
    const instanceDefinition = await definitions.getAgentDef(instance.agentDefId);
    expect(instanceDefinition?.agentTools?.map(tool => tool.toolId)).toEqual(expect.arrayContaining([
      'workspacesList',
      'wikiSearch',
      'wikiOperation',
    ]));
  });

  it('adds missing Desktop tools without replacing a configured tool', () => {
    const configuredWikiSearch: AgentDefinitionToolConfig = {
      toolId: 'wikiSearch',
      parameters: { wikiSearchParam: { sourceType: 'custom-wiki' } },
    };
    const desktopTools: AgentDefinitionToolConfig[] = [
      { toolId: 'workspacesList' },
      { toolId: 'wikiSearch', parameters: { wikiSearchParam: { sourceType: 'desktop-wiki' } } },
      { toolId: 'wikiOperation' },
    ];
    const result = mergeDesktopGeneralAssistantTools([configuredWikiSearch], desktopTools);

    expect(result.map(tool => tool.toolId)).toEqual(['workspacesList', 'wikiSearch', 'wikiOperation']);
    expect(result[1]).toBe(configuredWikiSearch);
  });
});
