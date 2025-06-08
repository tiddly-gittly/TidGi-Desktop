/* eslint-disable unicorn/prevent-abbreviations */
import { injectable } from 'inversify';
import { pick } from 'lodash';
import { nanoid } from 'nanoid';
import { DataSource, Repository } from 'typeorm';

import defaultAgents from '@services/agentInstance/buildInAgentHandlers/defaultAgents.json';
import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

import { IAgentBrowserService } from '@services/agentBrowser/interface';
import { AgentDefinition, IAgentDefinitionService } from './interface';

@injectable()
export class AgentDefinitionService implements IAgentDefinitionService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;
  @lazyInject(serviceIdentifier.AgentInstance)
  private readonly agentInstanceService!: IAgentDefinitionService;
  @lazyInject(serviceIdentifier.AgentBrowser)
  private readonly agentBrowserService!: IAgentBrowserService;

  private dataSource: DataSource | null = null;
  private agentDefRepository: Repository<AgentDefinitionEntity> | null = null;

  public async initialize(): Promise<void> {
    try {
      // Initialize the database
      await this.databaseService.initializeDatabase('agent-default');
      logger.debug('Agent database initialized');
      this.dataSource = await this.databaseService.getDatabase('agent-default');
      this.agentDefRepository = this.dataSource.getRepository(AgentDefinitionEntity);
      logger.debug('Agent repositories initialized');
      logger.debug('Agent handlers registered');
      await this.agentInstanceService.initialize();
      await this.agentBrowserService.initialize();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize agent service: ${errorMessage}`);
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

  /**
   * Create a new agent definition
   */
  public async createAgentDef(agent: AgentDefinition): Promise<AgentDefinition> {
    this.ensureRepositories();

    try {
      // Generate ID if not provided
      if (!agent.id) {
        agent.id = nanoid();
      }

      const agentDefEntity = this.agentDefRepository!.create({
        ...agent,
      });

      await this.agentDefRepository!.save(agentDefEntity);
      logger.info(`Created agent definition: ${agent.id}`);

      return agent;
    } catch (error) {
      logger.error(`Failed to create agent definition: ${error as Error}`);
      throw error;
    }
  }

  /**
   * Update existing agent definition
   */
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

  /**
   * Get all available agent definitions with optional filtering
   */
  public async getAgentDefs(options?: { searchName?: string }): Promise<AgentDefinition[]> {
    this.ensureRepositories();

    try {
      // Build query options
      let queryOptions = {};

      // Add fuzzy search condition if searchName provided
      if (options?.searchName) {
        queryOptions = {
          where: {
            name: { like: `%${options.searchName}%` },
          },
        };
      }

      // Get agent definitions from database
      const agentDefsFromDB = await this.agentDefRepository!.find(queryOptions);

      // Convert entities to agent definitions and create a map for quick lookup
      const agentDefsMap = new Map<string, AgentDefinition>();
      agentDefsFromDB.forEach(entity => {
        agentDefsMap.set(entity.id, {
          ...pick(entity, ['id', 'description', 'avatarUrl', 'handlerID', 'handlerConfig', 'aiApiConfig']),
          name: entity.name || '',
        });
      });

      // Default agents to be added to database
      const defaultAgentsToSave = [];

      // Add default agents if they don't exist in the database
      const defaultAgentsList = defaultAgents as AgentDefinition[];
      for (const defaultAgent of defaultAgentsList) {
        // Skip if this agent exists in the database (user might have customized it)
        if (agentDefsMap.has(defaultAgent.id)) {
          continue;
        }

        // If searchName is provided, filter default agents by name
        if (options?.searchName && !defaultAgent.name.toLowerCase().includes(options.searchName.toLowerCase())) {
          continue;
        }

        // Add default agent to the map and to the save list
        agentDefsMap.set(defaultAgent.id, defaultAgent);
        defaultAgentsToSave.push(defaultAgent);
      }

      // Save default agents to database in bulk if any were found
      // This ensures that foreign key constraints are satisfied when creating agent instances
      if (defaultAgentsToSave.length > 0) {
        try {
          // Create agent definition entities
          const agentDefEntities = defaultAgentsToSave.map(agent =>
            this.agentDefRepository!.create({
              ...agent,
            })
          );

          // Save all at once
          await this.agentDefRepository!.save(agentDefEntities);
          logger.info(`Saved ${defaultAgentsToSave.length} default agents to database`);
        } catch (saveError) {
          logger.error(`Failed to save default agents to database: ${saveError as Error}`);
          // Continue even if save fails, we'll still return the agents from memory
        }
      }

      // Return combined list of agents
      return Array.from(agentDefsMap.values());
    } catch (error) {
      logger.error(`Failed to get agent definitions: ${error as Error}`);
      throw error;
    }
  }

  /**
   * Get specific agent definition by ID or default agent if ID not provided
   */
  public async getAgentDef(defId?: string): Promise<AgentDefinition | undefined> {
    this.ensureRepositories();

    try {
      // Get default agent definition if ID not provided
      // TODO: Get default agent from preferences
      if (!defId) {
        // Temporary solution: get the first agent definition
        const agents = await this.getAgentDefs();
        return agents.length > 0 ? agents[0] : undefined;
      }

      // Try to find agent in database first
      const entity = await this.agentDefRepository!.findOne({
        where: { id: defId },
      });

      // If found in database, return it
      if (entity) {
        return {
          ...pick(entity, ['id', 'description', 'avatarUrl', 'handlerID', 'handlerConfig', 'aiApiConfig']),
          name: entity.name || '',
        };
      }

      // If not found in database, check default agents
      const defaultAgentsList = defaultAgents as AgentDefinition[];
      const defaultAgent = defaultAgentsList.find(agent => agent.id === defId);

      // If found in default agents, save to database first to satisfy foreign key constraints
      if (defaultAgent) {
        logger.info(`Default agent "${defaultAgent.name}" (${defId}) not found in database, creating it`);
        try {
          // Create agent definition in database
          const agentDefEntity = this.agentDefRepository!.create({
            ...defaultAgent,
          });
          await this.agentDefRepository!.save(agentDefEntity);
          logger.info(`Created default agent definition in database: ${defId}`);
        } catch (saveError) {
          logger.error(`Failed to save default agent to database: ${saveError as Error}`);
          // Continue and return the default agent even if save fails
          // This might lead to foreign key constraint errors later,
          // but at least we tried to save it
        }
      }

      return defaultAgent;
    } catch (error) {
      logger.error(`Failed to get agent definition: ${error as Error}`);
      throw error;
    }
  }

  /**
   * Delete agent definition and all associated instances
   * Note: This will delegate instance deletion to AgentInstanceService
   */
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
}
