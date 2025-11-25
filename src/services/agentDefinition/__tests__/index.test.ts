import { AgentDefinitionService } from '@services/agentDefinition';
import { AgentDefinition } from '@services/agentDefinition/interface';
import defaultAgents from '@services/agentInstance/agentFrameworks/taskAgents.json';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
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
      wikiService: { wikiOperationInServer: (...args: unknown[]) => Promise<unknown> };
      workspaceService: { getWorkspacesAsList: () => Promise<unknown[]> };
    };
    // Manually inject agentInstanceService to avoid lazyInject issues
    serviceWithPrivate.agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

    // Mock wiki and workspace services for template testing
    serviceWithPrivate.wikiService = {
      wikiOperationInServer: vi.fn().mockResolvedValue([]),
    };
    serviceWithPrivate.workspaceService = {
      getWorkspacesAsList: vi.fn().mockResolvedValue([]),
    };

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

  it('should initialize default agents on first run when database is empty', async () => {
    // Get the real database repository that the service uses
    const realDatabaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const realDataSource = await realDatabaseService.getDatabase('agent');
    const agentDefRepo = realDataSource.getRepository(AgentDefinitionEntity);

    // Ensure database is empty before initialization
    await agentDefRepo.clear();
    expect(await agentDefRepo.count()).toBe(0);

    // Create a fresh service instance to test initialization behavior
    const freshService = new AgentDefinitionService();
    const freshServiceWithPrivate = freshService as unknown as {
      databaseService: IDatabaseService;
      agentInstanceService: IAgentInstanceService;
      agentBrowserService: { initialize: () => Promise<void> };
    };
    freshServiceWithPrivate.databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    freshServiceWithPrivate.agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);
    // Mock agentBrowserService for this test
    freshServiceWithPrivate.agentBrowserService = {
      initialize: async () => {},
    };

    // Initialize the fresh service - this should create default agents
    await freshService.initialize();

    // Check that default agents were created in database
    const count = await agentDefRepo.count();
    expect(count).toBeGreaterThan(0);

    // Verify that the agents have complete data
    const defs = await freshService.getAgentDefs();
    expect(defs.length).toBeGreaterThan(0);

    const exampleAgent = defs.find(d => d.id === (defaultAgents as AgentDefinition[])[0].id);
    expect(exampleAgent).toBeDefined();
    expect(exampleAgent!.name).toBeDefined();
    expect(exampleAgent!.handlerID).toBeDefined();
    expect(exampleAgent!.handlerConfig).toBeDefined();
    expect(typeof exampleAgent!.handlerConfig).toBe('object');
  });

  it('should return only database data without fallback to defaultAgents', async () => {
    // Get the real database repository that the service uses
    const realDatabaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    const realDataSource = await realDatabaseService.getDatabase('agent');
    const agentDefRepo = realDataSource.getRepository(AgentDefinitionEntity);

    // Save only minimal record (id only) to test new behavior
    const example = (defaultAgents as AgentDefinition[])[0];
    await agentDefRepo.save({
      id: example.id,
    });

    const defs = await agentDefinitionService.getAgentDefs();

    const found = defs.find(d => d.id === example.id);
    expect(found).toBeDefined();
    // With new behavior, only id should be present, other fields should be undefined or empty
    expect(found!.id).toBe(example.id);
    expect(found!.handlerID).toBeUndefined();
    expect(found!.name).toBeUndefined();
    expect(found!.description).toBeUndefined();
    expect(found!.avatarUrl).toBeUndefined();
    expect(found!.handlerConfig).toEqual({});
    expect(found!.aiApiConfig).toBeUndefined();
    expect(found!.agentTools).toBeUndefined();
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

  it('should return default agents as templates from getAgentTemplates', async () => {
    const templates = await agentDefinitionService.getAgentTemplates();

    // Should include all default agents
    expect(templates.length).toBe((defaultAgents as AgentDefinition[]).length);

    // Check that template has complete data from taskAgents.json
    const exampleTemplate = templates.find(t => t.id === (defaultAgents as AgentDefinition[])[0].id);
    expect(exampleTemplate).toBeDefined();
    expect(exampleTemplate!.name).toBeDefined();
    expect(exampleTemplate!.handlerID).toBeDefined();
    expect(exampleTemplate!.handlerConfig).toBeDefined();
    expect(typeof exampleTemplate!.handlerConfig).toBe('object');
  });

  it('should not throw when searchName filtering is requested (client-side filtering expected)', async () => {
    // getAgentTemplates no longer accepts searchName; client is expected to filter results.
    const templates = await agentDefinitionService.getAgentTemplates();
    expect(Array.isArray(templates)).toBe(true);
  });

  it('should handle wiki service errors gracefully in getAgentTemplates', async () => {
    const serviceWithPrivate = agentDefinitionService as unknown as {
      wikiService: { wikiOperationInServer: (...args: unknown[]) => Promise<unknown> };
    };

    // Mock wiki service to throw error
    serviceWithPrivate.wikiService.wikiOperationInServer = vi.fn().mockRejectedValue(new Error('Wiki error'));

    // Should still return default agents and not throw
    const templates = await agentDefinitionService.getAgentTemplates();
    expect(templates.length).toBe((defaultAgents as AgentDefinition[]).length);
  });
});
