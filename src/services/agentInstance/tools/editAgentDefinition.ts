/**
 * Edit-Agent-Definition Tool — allows an agent to modify its own AgentDefinition configuration.
 * Supports updating the heartbeat schedule, tool approvals, and system prompt config.
 * Operates with approval mode "confirm" by default (user must approve each change).
 */
import { t } from '@services/libs/i18n/placeholder';
import { z } from 'zod/v4';
import { registerToolDefinition } from './defineTool';

export const EditAgentDefinitionParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
}).meta({ title: 'Edit Agent Definition Config', description: 'Configuration for the edit-agent-definition tool' });

export type EditAgentDefinitionParameter = z.infer<typeof EditAgentDefinitionParameterSchema>;

const EditHeartbeatToolSchema = z.object({
  enabled: z.boolean().meta({
    title: 'Enabled',
    description: 'Enable or disable the heartbeat schedule.',
  }),
  intervalSeconds: z.number().optional().meta({
    title: 'Interval (seconds)',
    description: 'How often to fire the heartbeat. Minimum 60.',
  }),
  message: z.string().optional().meta({
    title: 'Message',
    description: 'Message sent to the agent on each heartbeat.',
  }),
  activeHoursStart: z.string().optional().meta({
    title: 'Active hours start',
    description: 'HH:MM — skip heartbeats before this time.',
  }),
  activeHoursEnd: z.string().optional().meta({
    title: 'Active hours end',
    description: 'HH:MM — skip heartbeats after this time.',
  }),
}).meta({
  title: 'edit-heartbeat',
  description: "Modify this agent's heartbeat (periodic self-wake) configuration. Requires user approval.",
  examples: [
    { enabled: true, intervalSeconds: 300, message: 'Periodic check-in. Review tasks and take pending actions.' },
    { enabled: false },
  ],
});

const EditAgentPromptToolSchema = z.object({
  field: z.string().meta({
    title: 'Config field',
    description: 'The agentFrameworkConfig field name to update.',
  }),
  value: z.string().meta({
    title: 'Value',
    description: 'New value for the config field.',
  }),
}).meta({
  title: 'edit-agent-prompt-config',
  description: "Modify a field in this agent's framework configuration (e.g. system prompt customization). Requires user approval.",
});

const editAgentDefinitionDefinition = registerToolDefinition({
  toolId: 'editAgentDefinition',
  displayName: 'Edit Agent Definition',
  description: 'Modify own heartbeat schedule and framework configuration',
  configSchema: EditAgentDefinitionParameterSchema,
  llmToolSchemas: {
    'edit-heartbeat': EditHeartbeatToolSchema,
    'edit-agent-prompt-config': EditAgentPromptToolSchema,
  },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, executeToolCall, agentFrameworkContext }) {
    if (!toolCall) return;
    const agentId = agentFrameworkContext.agent.id;

    if (toolCall.toolId === 'edit-heartbeat') {
      await executeToolCall('edit-heartbeat', async (parameters) => {
        const { container } = await import('@services/container');
        const serviceIdentifier = (await import('@services/serviceIdentifier')).default;
        const agentInstanceService = container.get<import('../interface').IAgentInstanceService>(serviceIdentifier.AgentInstance);

        await agentInstanceService.setBackgroundHeartbeat(agentId, {
          enabled: parameters.enabled,
          intervalSeconds: Math.max(60, parameters.intervalSeconds ?? 300),
          message: parameters.message,
          activeHoursStart: parameters.activeHoursStart,
          activeHoursEnd: parameters.activeHoursEnd,
        });

        return {
          success: true,
          data: parameters.enabled
            ? `Heartbeat enabled — will fire every ${parameters.intervalSeconds ?? 300}s.`
            : 'Heartbeat disabled.',
        };
      });
      return;
    }

    if (toolCall.toolId === 'edit-agent-prompt-config') {
      await executeToolCall('edit-agent-prompt-config', async (parameters) => {
        const { container } = await import('@services/container');
        const serviceIdentifier = (await import('@services/serviceIdentifier')).default;
        const agentInstanceService = container.get<import('../interface').IAgentInstanceService>(serviceIdentifier.AgentInstance);

        const agent = await agentInstanceService.getAgent(agentId);
        if (!agent) throw new Error(`Agent not found: ${agentId}`);

        const { container: iocContainer } = await import('@services/container');
        const agentDefinitionService = iocContainer.get<import('@services/agentDefinition/interface').IAgentDefinitionService>(serviceIdentifier.AgentDefinition);

        const agentDefinition = await agentDefinitionService.getAgentDef(agent.agentDefId);
        if (!agentDefinition) throw new Error(`Agent definition not found: ${agent.agentDefId}`);

        const updatedConfig = {
          ...(agentDefinition.agentFrameworkConfig ?? {}),
          [parameters.field]: parameters.value,
        };

        await agentDefinitionService.updateAgentDef({ id: agentDefinition.id, agentFrameworkConfig: updatedConfig });

        return {
          success: true,
          data: `Updated agentFrameworkConfig.${parameters.field} = "${parameters.value}".`,
        };
      });
    }
  },
});

export const editAgentDefinitionTool = editAgentDefinitionDefinition.tool;
