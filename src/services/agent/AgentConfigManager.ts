import { IExternalAPIService } from '@services/externalAPI/interface';
import { logger } from '@services/libs/log';
import { get, merge } from 'lodash';
import { AgentDatabaseManager } from './AgentDatabaseManager';
import { AgentConfigSchema, AgentPromptDescription, AiAPIConfig } from './defaultAgents/schemas';

/**
 * Manages agent configuration including cascade resolution
 */
export class AgentConfigManager {
  private dbManager: AgentDatabaseManager;
  private externalAPIService: IExternalAPIService;

  constructor(databaseManager: AgentDatabaseManager, externalAPIService: IExternalAPIService) {
    this.dbManager = databaseManager;
    this.externalAPIService = externalAPIService;
  }

  /**
   * Get agent AI configuration
   */
  async getAgentAIConfig(agentId: string): Promise<AgentPromptDescription | null> {
    try {
      const agent = await this.dbManager.getAgent(agentId);

      if (agent && agent.aiConfig) {
        // Let Zod handle parsing and validation directly, no need for extra type assertions
        return AgentConfigSchema.parse(JSON.parse(agent.aiConfig));
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get AI config for agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Get AI configuration based on task ID and agent ID
   * Cascades: task -> agent -> global defaults
   * @param taskId Optional task ID
   * @param agentId Optional agent ID (not needed if taskId is provided)
   * @returns Combined AI configuration
   */
  async getAIConfigByIds(taskId?: string, agentId?: string): Promise<AiAPIConfig> {
    try {
      // Get global default configuration
      const defaultConfig = await this.externalAPIService.getAIConfig();
      // Get configuration cascade
      const { taskConfig, agentConfig } = await this.dbManager.getAIConfigCascade(taskId, agentId);

      // Merge configurations with precedence: task > agent > defaults
      const finalConfig: AiAPIConfig = {
        api: {
          provider: get(taskConfig, 'api.provider') || get(agentConfig, 'api.provider') || defaultConfig.api.provider,
          model: get(taskConfig, 'api.model') || get(agentConfig, 'api.model') || defaultConfig.api.model,
        },
        // Use merge to combine model parameters according to priority
        modelParameters: merge({}, defaultConfig.modelParameters, agentConfig?.modelParameters, taskConfig?.modelParameters),
      };

      return finalConfig;
    } catch (error) {
      logger.error('Failed to get AI configuration:', error);
      // Fallback to default configuration
      return this.externalAPIService.getAIConfig();
    }
  }

  /**
   * Update agent-specific AI configuration
   */
  async updateAgentAIConfig(agentId: string, config: Partial<AiAPIConfig>): Promise<void> {
    try {
      // Get current agent configuration
      const currentConfig = await this.getAgentAIConfig(agentId) || {} as AgentPromptDescription;

      // Create update object conforming to AgentPromptDescription
      const updateObject: Partial<AgentPromptDescription> = merge({}, currentConfig, {
        api: config.api || {},
        modelParameters: config.modelParameters || {},
      });

      // Update agent configuration in database
      await this.dbManager.updateAgentAIConfig(agentId, updateObject);
      logger.info(`Updated AI configuration for agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to update AI configuration for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Update task-specific AI configuration
   */
  async updateTaskAIConfig(taskId: string, config: Partial<AiAPIConfig>): Promise<void> {
    try {
      await this.dbManager.updateTaskAIConfig(taskId, config);
      logger.info(`Updated AI configuration for task ${taskId}`);
    } catch (error) {
      logger.error(`Failed to update AI configuration for task ${taskId}:`, error);
      throw error;
    }
  }
}
