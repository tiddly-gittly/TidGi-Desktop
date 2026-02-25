/**
 * Spawn Agent (Sub-agent) Tool — creates a child AgentInstance to handle a sub-task.
 * The child runs independently and returns its final result to the parent.
 */
import { container } from '@services/container';
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { z } from 'zod/v4';
import type { IAgentInstanceService } from '../interface';
import { registerToolDefinition, type ToolExecutionResult } from './defineTool';

export const SpawnAgentParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
  toolResultDuration: z.number().optional().default(2).meta({ title: 'Tool result duration', description: 'Rounds sub-agent result stays in context' }),
  defaultTimeoutMs: z.number().optional().default(120000).meta({ title: 'Default timeout (ms)', description: 'Default timeout for sub-agent execution' }),
}).meta({ title: 'Spawn Agent Config', description: 'Configuration for sub-agent spawning tool' });

export type SpawnAgentParameter = z.infer<typeof SpawnAgentParameterSchema>;

const SpawnAgentToolSchema = z.object({
  task: z.string().meta({
    title: 'Task description',
    description: 'The task to delegate to the sub-agent. Be specific and include all necessary context.',
  }),
  context: z.string().optional().meta({
    title: 'Additional context',
    description: 'Extra context to pass to the sub-agent (e.g., relevant tiddler contents, search results).',
  }),
  agentDefinitionId: z.string().optional().meta({
    title: 'Agent definition ID',
    description: 'Optional: use a specific agent definition for the sub-agent. If omitted, uses the same definition as the parent.',
  }),
}).meta({
  title: 'spawn-agent',
  description:
    'Delegate a sub-task to a new agent instance. The sub-agent runs independently with its own conversation, tools, and context. Use this for complex tasks that benefit from focused, isolated processing. The sub-agent result will be returned to you.',
  examples: [
    { task: 'Search for all tiddlers tagged "Project" and create a summary note.' },
    { task: 'Analyze the backlinks of the "JavaScript" tiddler and suggest related topics.', context: 'The user is building a programming knowledge base.' },
  ],
});

async function executeSpawnAgent(
  parameters: z.infer<typeof SpawnAgentToolSchema>,
  parentAgentId: string,
  parentDefinitionId: string,
  timeoutMs: number,
): Promise<ToolExecutionResult> {
  const { task, context: taskContext, agentDefinitionId } = parameters;
  const agentInstanceService = container.get<IAgentInstanceService>(serviceIdentifier.AgentInstance);

  const definitionId = agentDefinitionId || parentDefinitionId;
  logger.info('Spawning sub-agent', { parentAgentId, definitionId, taskLength: task.length });

  try {
    // Create child instance marked as sub-agent
    const childAgent = await agentInstanceService.createAgent(definitionId);

    // Mark as sub-agent in the database
    await agentInstanceService.updateAgent(childAgent.id, {
      isSubAgent: true,
      parentAgentId,
      name: `Sub-task: ${task.substring(0, 50)}...`,
    });

    // Compose the message for the sub-agent
    const fullMessage = taskContext
      ? `${task}\n\n<context>\n${taskContext}\n</context>`
      : task;

    // Send message and wait for completion with timeout
    const resultPromise = new Promise<ToolExecutionResult>((resolve) => {
      let resolved = false;
      const subscription = agentInstanceService.subscribeToAgentUpdates(childAgent.id).subscribe({
        next: (agent) => {
          if (resolved || !agent) return;
          const state = agent.status?.state;
          if (state === 'completed' || state === 'failed' || state === 'canceled') {
            resolved = true;
            subscription.unsubscribe();

            // Get the last assistant message as the result
            const lastAssistant = [...(agent.messages || [])].reverse().find(m => m.role === 'assistant');
            const resultText = lastAssistant?.content || agent.status?.message?.content || '(sub-agent completed with no output)';

            resolve({
              success: state === 'completed',
              data: state === 'completed' ? resultText : undefined,
              error: state !== 'completed' ? `Sub-agent ${state}: ${resultText}` : undefined,
              metadata: { childAgentId: childAgent.id, state },
            });
          }
        },
        error: (error) => {
          if (!resolved) {
            resolved = true;
            resolve({ success: false, error: `Sub-agent subscription error: ${error}` });
          }
        },
      });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          subscription.unsubscribe();
          // Cancel the sub-agent
          void agentInstanceService.cancelAgent(childAgent.id);
          resolve({
            success: false,
            error: `Sub-agent timed out after ${timeoutMs}ms. The sub-task may have been too complex.`,
            metadata: { childAgentId: childAgent.id, timedOut: true },
          });
        }
      }, timeoutMs);
    });

    // Send the task to sub-agent
    await agentInstanceService.sendMsgToAgent(childAgent.id, { text: fullMessage });

    return await resultPromise;
  } catch (error) {
    return { success: false, error: `Failed to spawn sub-agent: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const spawnAgentDefinition = registerToolDefinition({
  toolId: 'spawnAgent',
  displayName: 'Spawn Sub-Agent',
  description: 'Delegate a sub-task to a new agent instance',
  configSchema: SpawnAgentParameterSchema,
  llmToolSchemas: { 'spawn-agent': SpawnAgentToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext, config }) {
    if (!toolCall || toolCall.toolId !== 'spawn-agent') return;
    if (agentFrameworkContext.isCancelled()) return;

    const timeoutMs = config?.defaultTimeoutMs ?? 120000;
    await executeToolCall('spawn-agent', (parameters) => executeSpawnAgent(parameters, agentFrameworkContext.agent.id, agentFrameworkContext.agentDef.id, timeoutMs));
  },
});

export const spawnAgentTool = spawnAgentDefinition.tool;
