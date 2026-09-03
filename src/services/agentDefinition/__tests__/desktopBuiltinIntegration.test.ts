import { nanoid } from 'nanoid';
import { beforeAll, describe, expect, it } from 'vitest';

import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { getDefaultAgentDefinitionId } from '../defaults';
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
});
