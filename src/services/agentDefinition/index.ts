import { inject, injectable } from 'inversify';
import { pick } from 'lodash';
import { nanoid } from 'nanoid';
import { DataSource, Repository } from 'typeorm';

import type { IAgentBrowserService } from '@services/agentBrowser/interface';
import defaultAgents from '@services/agentInstance/buildInAgentHandlers/defaultAgents.json';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import { lazyInject } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { getWikiAgentTemplates } from './getAgentDefinitionTemplatesFromWikis';
import type { AgentDefinition, IAgentDefinitionService } from './interface';

@injectable()
export class AgentDefinitionService implements IAgentDefinitionService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;
  @lazyInject(serviceIdentifier.AgentInstance)
  private readonly agentInstanceService!: IAgentInstanceService;
  @inject(serviceIdentifier.AgentBrowser)
  private readonly agentBrowserService!: IAgentBrowserService;

  private dataSource: DataSource | null = null;
  private agentDefRepository: Repository<AgentDefinitionEntity> | null = null;

  public async initialize(): Promise<void> {
    try {
      // Initialize the database
      await this.databaseService.initializeDatabase('agent');
      logger.debug('Agent database initialized');
      this.dataSource = await this.databaseService.getDatabase('agent');
      this.agentDefRepository = this.dataSource.getRepository(AgentDefinitionEntity);
      logger.debug('Agent repositories initialized');

      // Check if database is empty and initialize with default agents if needed
      await this.initializeDefaultAgentsIfEmpty();
      logger.debug('Agent handlers registered');

      // Initialize dependent services if they're ready (lazyInject may not be ready immediately)
      if (this.agentInstanceService) {
        await this.agentInstanceService.initialize();
      } else {
        logger.warn('agentInstanceService not ready yet during AgentDefinitionService initialization');
      }

      if (this.agentBrowserService) {
        await this.agentBrowserService.initialize();
      } else {
        logger.warn('agentBrowserService not ready yet during AgentDefinitionService initialization');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize agent service: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Initialize default agents if database is empty (for first-time users)
   */
  private async initializeDefaultAgentsIfEmpty(): Promise<void> {
    if (!this.agentDefRepository) {
      throw new Error('Agent repositories not initialized');
    }

    try {
      // Check if database is empty
      const existingCount = await this.agentDefRepository.count();
      if (existingCount === 0) {
        logger.info('Agent database is empty, initializing with default agents');
        const defaultAgentsList = defaultAgents as AgentDefinition[];
        // Create agent definition entities with complete data from defaultAgents.json
        const agentDefinitionEntities = defaultAgentsList.map(defaultAgent =>
          this.agentDefRepository!.create({
            id: defaultAgent.id,
            name: defaultAgent.name,
            description: defaultAgent.description,
            avatarUrl: defaultAgent.avatarUrl,
            handlerID: defaultAgent.handlerID,
            handlerConfig: defaultAgent.handlerConfig,
            aiApiConfig: defaultAgent.aiApiConfig,
            agentTools: defaultAgent.agentTools,
          })
        );
        // Save all default agents to database
        await this.agentDefRepository.save(agentDefinitionEntities);
        logger.info(`Initialized ${defaultAgentsList.length} default agents in database`);
      } else {
        logger.debug(`Agent database already contains ${existingCount} agents, skipping default initialization`);
      }
    } catch (error) {
      logger.error(`Failed to initialize default agents: ${error as Error}`);
      throw error;
    }
  }

  /**
   * Ensure repositories are initialized
   */
  private ensureRepositories(): void {
    if (!this.agentDefRepository) {
      throw new Error('Agent repositories not initialized');
    }
  }

  // Create a new agent definition
  public async createAgentDef(agent: AgentDefinition): Promise<AgentDefinition> {
    this.ensureRepositories();

    try {
      // Generate ID if not provided
      if (!agent.id) {
        agent.id = nanoid();
      }

      const agentDefinitionEntity = this.agentDefRepository!.create({
        ...agent,
      });

      await this.agentDefRepository!.save(agentDefinitionEntity);
      logger.info(`Created agent definition: ${agent.id}`);

      return agent;
    } catch (error) {
      logger.error(`Failed to create agent definition: ${error as Error}`);
      throw error;
    }
  }

  // Update existing agent definition
  public async updateAgentDef(agent: Partial<AgentDefinition> & { id: string }): Promise<AgentDefinition> {
    this.ensureRepositories();

    try {
      // Check if agent exists
      const existingAgent = await this.agentDefRepository!.findOne({
        where: { id: agent.id },
      });

      if (!existingAgent) {
        throw new Error(`Agent definition not found: ${agent.id}`);
      }

      const pickedProperties = pick(agent, ['name', 'description', 'avatarUrl', 'handlerID', 'handlerConfig', 'aiApiConfig']);
      Object.assign(existingAgent, pickedProperties);

      await this.agentDefRepository!.save(existingAgent);
      logger.info(`Updated agent definition: ${agent.id}`);

      return existingAgent as AgentDefinition;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to update agent definition: ${errorMessage}`);
      throw error;
    }
  }

  // Get all available agent definitions
  public async getAgentDefs(): Promise<AgentDefinition[]> {
    this.ensureRepositories();

    try {
      // Get agent definitions from database (no server-side search; client should filter)
      const agentDefsFromDB = await this.agentDefRepository!.find();

      // Convert entities to agent definitions
      const agentDefs: AgentDefinition[] = agentDefsFromDB.map(entity => ({
        id: entity.id,
        name: entity.name || undefined,
        description: entity.description || undefined,
        avatarUrl: entity.avatarUrl || undefined,
        handlerID: entity.handlerID || undefined,
        handlerConfig: entity.handlerConfig || {},
        aiApiConfig: entity.aiApiConfig || undefined,
        agentTools: entity.agentTools || undefined,
      }));

      return agentDefs;
    } catch (error) {
      logger.error(`Failed to get agent definitions: ${error as Error}`);
      throw error;
    }
  }

  // Get specific agent definition by ID or default agent if ID not provided
  public async getAgentDef(definitionId?: string): Promise<AgentDefinition | undefined> {
    this.ensureRepositories();

    try {
      // Get default agent definition if ID not provided
      // TODO: Get default agent from preferences
      if (!definitionId) {
        // Temporary solution: get the first agent definition
        const agents = await this.getAgentDefs();
        return agents.length > 0 ? agents[0] : undefined;
      }

      // Find agent in database
      const entity = await this.agentDefRepository!.findOne({
        where: { id: definitionId },
      });

      if (!entity) {
        return undefined;
      }

      // Convert entity to agent definition
      const agentDefinition: AgentDefinition = {
        id: entity.id,
        name: entity.name || undefined,
        description: entity.description || undefined,
        avatarUrl: entity.avatarUrl || undefined,
        handlerID: entity.handlerID || undefined,
        handlerConfig: entity.handlerConfig || {},
        aiApiConfig: entity.aiApiConfig || undefined,
        agentTools: entity.agentTools || undefined,
      };

      return agentDefinition;
    } catch (error) {
      logger.error(`Failed to get agent definition: ${error as Error}`);
      throw error;
    }
  }

  // Delete agent definition and all associated instances
  // Note: This will delegate instance deletion to AgentInstanceService
  public async deleteAgentDef(id: string): Promise<void> {
    this.ensureRepositories();

    try {
      // Delete the agent definition - instances will be handled by cleanup processes
      await this.agentDefRepository!.delete(id);
      logger.info(`Deleted agent definition: ${id}`);
    } catch (error) {
      logger.error(`Failed to delete agent definition: ${error as Error}`);
      throw error;
    }
  }

  public async getAgentTemplates(): Promise<AgentDefinition[]> {
    try {
      const templates: AgentDefinition[] = [];

      // Add default agents from JSON
      const defaultAgentsList = defaultAgents as AgentDefinition[];
      templates.push(...defaultAgentsList);

      // Get templates from active main workspaces
      const wikiTemplates = await getWikiAgentTemplates();
      templates.push(...wikiTemplates);

      logger.debug(`Found ${templates.length} agent templates`, {
        total: templates.length,
        defaultAgents: defaultAgentsList.length,
        wikiTemplates: wikiTemplates.length,
      });

      return templates;
    } catch (error) {
      logger.error(`Failed to get agent templates: ${error as Error}`);
      throw error;
    }
  }
}
