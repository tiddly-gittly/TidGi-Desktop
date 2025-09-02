/* eslint-disable unicorn/prevent-abbreviations */
import { inject, injectable } from 'inversify';
import { pick } from 'lodash';
import { nanoid } from 'nanoid';
import { DataSource, Repository } from 'typeorm';

import { IAgentBrowserService } from '@services/agentBrowser/interface';
import defaultAgents from '@services/agentInstance/buildInAgentHandlers/defaultAgents.json';
import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { AgentDefinition, IAgentDefinitionService } from './interface';

@injectable()
export class AgentDefinitionService implements IAgentDefinitionService {
  @inject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;
  @lazyInject(serviceIdentifier.AgentInstance)
  private readonly agentInstanceService!: IAgentDefinitionService;
  @inject(serviceIdentifier.AgentBrowser)
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
   * Helper to pick field from DB entity or fallback to default.
   * Treat empty string as missing so default can be used.
   */
  private pickField<T>(dbVal: T | null | undefined, defVal: T | undefined): T | undefined {
    if (dbVal === null || dbVal === undefined) return defVal;
    if (typeof dbVal === 'string' && dbVal.trim() === '') return defVal;
    return dbVal as T;
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

      // Default agents list and map for fallback values
      const defaultAgentsList = defaultAgents as AgentDefinition[];
      const defaultAgentsMap = new Map<string, AgentDefinition>(defaultAgentsList.map(a => [a.id, a]));

      // Convert entities to agent definitions and create a map for quick lookup
      const agentDefsMap = new Map<string, AgentDefinition>();
      agentDefsFromDB.forEach(entity => {
        const def = defaultAgentsMap.get(entity.id);
        // prefer stored values; fallback to default agent fields when stored values are nullish
        const merged: AgentDefinition = {
          id: entity.id,
          name: this.pickField(entity.name, def?.name),
          description: this.pickField(entity.description, def?.description),
          avatarUrl: this.pickField(entity.avatarUrl, def?.avatarUrl),
          handlerID: this.pickField(entity.handlerID, def?.handlerID),
          handlerConfig: this.pickField(entity.handlerConfig, def?.handlerConfig),
          aiApiConfig: this.pickField(entity.aiApiConfig, def?.aiApiConfig),
          agentTools: this.pickField(entity.agentTools, def?.agentTools),
        };

        agentDefsMap.set(entity.id, merged);
      });

      // Default agents to be added to database (persist only minimal record)
      const defaultAgentsToSave: Array<Partial<AgentDefinition>> = [];

      // Add default agents if they don't exist in the database
      for (const defaultAgent of defaultAgentsList) {
        // Skip if this agent exists in the database (user might have customized it)
        if (agentDefsMap.has(defaultAgent.id)) {
          continue;
        }

        // If searchName is provided, filter default agents by name
        if (
          options?.searchName &&
          // only include if defaultAgent has a name and it matches
          defaultAgent.name &&
          !defaultAgent.name.toLowerCase().includes(options.searchName.toLowerCase())
        ) {
          continue;
        }

        // Add default agent to the map and to the save list
        agentDefsMap.set(defaultAgent.id, defaultAgent);
        // Persist only id to avoid persisting stale default fields
        defaultAgentsToSave.push({ id: defaultAgent.id });
      }

      // Save default agents to database in bulk if any were found
      // This ensures that foreign key constraints are satisfied when creating agent instances
      if (defaultAgentsToSave.length > 0) {
        try {
          // Create minimal agent definition entities (only id)
          const agentDefEntities = defaultAgentsToSave.map(agent =>
            this.agentDefRepository!.create({
              id: agent.id,
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

      // If found in database, return it with fallback to default agent fields when missing.
      if (entity) {
        const defaultAgentsList = defaultAgents as AgentDefinition[];
        const defaultAgent = defaultAgentsList.find(agent => agent.id === defId);

        // Merge entity with default agent fields for any nullish or empty values
        const merged: AgentDefinition = {
          id: entity.id,
          name: this.pickField(entity.name, defaultAgent?.name),
          description: this.pickField(entity.description, defaultAgent?.description),
          avatarUrl: this.pickField(entity.avatarUrl, defaultAgent?.avatarUrl),
          handlerID: this.pickField(entity.handlerID, defaultAgent?.handlerID),
          handlerConfig: this.pickField(entity.handlerConfig, defaultAgent?.handlerConfig),
          aiApiConfig: this.pickField(entity.aiApiConfig, defaultAgent?.aiApiConfig),
          agentTools: this.pickField(entity.agentTools, defaultAgent?.agentTools),
        };

        return merged;
      }

      // If not found in database, check default agents
      const defaultAgentsList = defaultAgents as AgentDefinition[];
      const defaultAgent = defaultAgentsList.find(agent => agent.id === defId);

      // If found in default agents, persist only id to DB to satisfy FK constraints
      if (defaultAgent) {
        logger.info(`Default agent "${defaultAgent.name}" (${defId}) not found in database, creating minimal record`);
        try {
          // Create minimal agent definition in database (only id)
          const agentDefEntity = this.agentDefRepository!.create({
            id: defaultAgent.id,
          });
          await this.agentDefRepository!.save(agentDefEntity);
          logger.info(`Created minimal default agent definition in database: ${defId}`);
        } catch (saveError) {
          logger.error(`Failed to save default agent to database: ${saveError as Error}`);
          // Continue and return the default agent even if save fails
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
