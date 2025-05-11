/* eslint-disable unicorn/prevent-abbreviations */
import { injectable } from 'inversify';
import { pick } from 'lodash';
import { nanoid } from 'nanoid';
import { DataSource, Repository } from 'typeorm';

import { lazyInject } from '@services/container';
import { IDatabaseService } from '@services/database/interface';
import { AgentDefinitionEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';

import { AgentDefinition, IAgentDefinitionService } from './interface';

@injectable()
export class AgentDefinitionService implements IAgentDefinitionService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

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
  public async updateAgentDef(agent: AgentDefinition): Promise<AgentDefinition> {
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

      return agent;
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

      const agentDefs = await this.agentDefRepository!.find(queryOptions);
      return agentDefs.map(entity => {
        return {
          ...pick(entity, ['id', 'description', 'avatarUrl', 'handlerID', 'handlerConfig', 'aiApiConfig']),
          name: entity.name || '',
        };
      });
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

      const entity = await this.agentDefRepository!.findOne({
        where: { id: defId },
      });

      if (!entity) {
        return undefined;
      }

      return {
        ...pick(entity, ['id', 'description', 'avatarUrl', 'handlerID', 'handlerConfig', 'aiApiConfig']),
        name: entity.name || '',
      };
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
