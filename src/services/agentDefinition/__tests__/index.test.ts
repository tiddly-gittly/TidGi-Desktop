import { AgentDefinitionService } from '@services/agentDefinition';
import { AgentDefinition } from '@services/agentDefinition/interface';
import defaultAgents from '@services/agentInstance/buildInAgentHandlers/defaultAgents.json';
import { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity } from '@services/database/schema/agent';
import serviceIdentifier from '@services/serviceIdentifier';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentDefinitionService getAgentDefs integration', () => {
  let agentDefinitionService: AgentDefinitionService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Ensure DatabaseService is initialized with all schemas
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    await databaseService.initializeForApp();

    // Use globally bound AgentDefinitionService (configured in src/__tests__/setup-vitest.ts)
    agentDefinitionService = container.get<AgentDefinitionService>(serviceIdentifier.AgentDefinition);

    const serviceWithPrivate = agentDefinitionService as unknown as {
      agentInstanceService: IAgentInstanceService;
    };
    // Manually inject agentInstanceService to avoid lazyInject issues
    serviceWithPrivate.agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

    // Initialize the service to set up dataSource and repositories using real database service
    await agentDefinitionService.initialize();

    // Clean up any existing test data from the real database
    try {
      const realDatabaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
      const realDataSource = await realDatabaseService.getDatabase('agent');
      const agentDefRepo = realDataSource.getRepository(AgentDefinitionEntity);
      await agentDefRepo.clear();
    } catch {
      // Ignore errors during cleanup
    }
  });

  afterEach(async () => {
    // Clean up is handled automatically by beforeEach for each test
  });

  it('should fallback missing DB fields to defaultAgents when only id persisted for build-in agent', async () => {
    // Get the real database repository that the service uses
    const realDatabaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const realDataSource = await realDatabaseService.getDatabase('agent');
    const agentDefRepo = realDataSource.getRepository(AgentDefinitionEntity);

    // Save only minimal record (id only) as per new behavior
    const example = (defaultAgents as AgentDefinition[])[0];
    await agentDefRepo.save({
      id: example.id,
    });

    const defs = await agentDefinitionService.getAgentDefs();

    const found = defs.find(d => d.id === example.id);
    expect(found).toBeDefined();
    // handlerID should be present from defaultAgents
    expect(found!.handlerID).toBe(example.handlerID);
    // name should be present from defaultAgents
    expect(found!.name).toBe(example.name);
  });

  it('should have only id field populated when directly querying database entity for build-in agent', async () => {
    // Get the real database repository that the service uses
    const realDatabaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const realDataSource = await realDatabaseService.getDatabase('agent');
    const agentDefRepo = realDataSource.getRepository(AgentDefinitionEntity);

    // Save only minimal record (id only) as per new behavior
    const example = (defaultAgents as AgentDefinition[])[0];
    await agentDefRepo.save({
      id: example.id,
    });

    // Directly query the database entity
    const entity = await agentDefRepo.findOne({
      where: { id: example.id },
    });

    expect(entity).toBeDefined();
    expect(entity!.id).toBe(example.id);
    // Other fields should be null/undefined since we only saved id
    expect(entity!.name).toBeNull();
    expect(entity!.description).toBeNull();
    expect(entity!.avatarUrl).toBeNull();
    expect(entity!.handlerID).toBeNull();
    expect(entity!.handlerConfig).toBeNull();
    expect(entity!.aiApiConfig).toBeNull();
    expect(entity!.agentTools).toBeNull();
  });
});
