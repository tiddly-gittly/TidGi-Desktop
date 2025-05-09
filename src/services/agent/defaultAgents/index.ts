import { logger } from '@services/libs/log';
import { AgentDatabaseManager } from '../AgentDatabaseManager';
import { Agent } from '../interface';
import { echoHandler } from './echo';
import { exampleAgentHandler } from './exampleAgent';

// Define default agent configurations
const defaultAgents: Agent[] = [
  // Echo agent
  {
    id: 'echo-agent',
    name: 'Echo Agent',
    description: 'Simple echo agent that returns user messages',
    avatarUrl: 'https://example.com/echo-agent.png',
    handler: echoHandler,
    card: {
      name: 'Echo Agent',
      description: 'Simple echo agent',
      url: 'http://localhost:41241/echo-agent',
      version: '1.0.0',
      capabilities: {
        streaming: true,
      },
      skills: [
        {
          id: 'echo',
          name: 'Echo',
          description: 'Echo user input',
        },
      ],
    },
  },
  // Example agent
  {
    id: 'example-agent',
    name: 'Example Agent',
    description: 'Example agent with prompt processing',
    avatarUrl: 'https://example.com/example-agent.png',
    handler: exampleAgentHandler,
    card: {
      name: 'Example Agent',
      description: 'Example agent with prompt processing',
      url: 'http://localhost:41241/example-agent',
      version: '1.0.0',
      capabilities: {
        streaming: true,
      },
      skills: [
        {
          id: 'example',
          name: 'Example Processing',
          description: 'Process prompts with custom configuration',
        },
      ],
    },
  },
];

/**
 * Register default agents
 * Only store default agents when they don't exist in database to avoid overwriting user configurations
 */
export async function registerDefaultAgents(
  agents: Map<string, Agent>,
  databaseManager: AgentDatabaseManager,
): Promise<void> {
  try {
    logger.info('Registering default agents');

    for (const defaultAgent of defaultAgents) {
      const existingAgent = await databaseManager.getAgent(defaultAgent.id);

      if (!existingAgent) {
        logger.info(`Creating default agent: ${defaultAgent.id}`);
        agents.set(defaultAgent.id, defaultAgent);
        await databaseManager.saveAgent({
          id: defaultAgent.id,
          name: defaultAgent.name,
          description: defaultAgent.description,
          avatarUrl: defaultAgent.avatarUrl,
          card: defaultAgent.card,
        });
      }
    }

    logger.info('Default agents registered successfully');
  } catch (error) {
    logger.error('Error registering default agents:', error);
    throw error;
  }
}
