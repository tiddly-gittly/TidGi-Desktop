import { AgentDefinitionService } from '@services/agentDefinition';
import { AgentDefinition } from '@services/agentDefinition/interface';
import defaultAgents from '@services/agentInstance/buildInAgentHandlers/defaultAgents.json';
import { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import serviceIdentifier from '@services/serviceIdentifier';
import { DataSource, Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentDefinitionService getAgentDefs integration', () => {
  let dataSource: DataSource;
  let agentDefinitionService: AgentDefinitionService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create in-memory SQLite database
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity],
      synchronize: true,
      logging: false,
    });

    await dataSource.initialize();

    // Make sure Database.getDatabase returns our in-memory dataSource
    const database = container.get<IDatabaseService>(serviceIdentifier.Database);
    database.getDatabase = vi.fn().mockResolvedValue(dataSource);

    // Use globally bound AgentDefinitionService (configured in src/__tests__/setup-vitest.ts)
    agentDefinitionService = container.get<AgentDefinitionService>(serviceIdentifier.AgentDefinition);

    const serviceWithPrivate = agentDefinitionService as unknown as {
      dataSource: DataSource | null;
      agentDefRepository: Repository<AgentDefinitionEntity> | null;
      agentInstanceService: IAgentInstanceService;
    };
    // Manually inject agentInstanceService to avoid lazyInject issues
    serviceWithPrivate.agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    // Initialize the service to set up dataSource and repositories
    await agentDefinitionService.initialize();
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('should fallback missing DB fields to defaultAgents when only id persisted for build-in agent', async () => {
    const agentDefRepo = dataSource.getRepository(AgentDefinitionEntity);

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
    const agentDefRepo = dataSource.getRepository(AgentDefinitionEntity);

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
