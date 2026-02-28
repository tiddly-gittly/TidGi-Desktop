/**
 * Summary Tool — terminates the agent loop and returns a final answer to the user.
 * When the agent calls this tool, it signals that the task is complete.
 */
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import { z } from 'zod/v4';
import { registerToolDefinition } from './defineTool';

export const SummaryParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
}).meta({ title: 'Summary Tool Config', description: 'Configuration for the summary/finish tool' });

export type SummaryParameter = z.infer<typeof SummaryParameterSchema>;

const SummaryToolSchema = z.object({
  text: z.string().meta({
    title: 'Summary text',
    description: 'The final summary or answer to present to the user. Use wikitext format.',
  }),
}).meta({
  title: 'summary',
  description: 'Call this tool when your task is fully complete. Provide a final summary in wikitext format. This will end the agent loop and present the answer to the user.',
  examples: [{ text: '!! Task Complete\n\nI have created the tiddler "My Note" with the requested content.' }],
});

const summaryDefinition = registerToolDefinition({
  toolId: 'summary',
  displayName: 'Summary (Finish)',
  description: 'Terminates the agent loop and presents a final summary to the user',
  configSchema: SummaryParameterSchema,
  llmToolSchemas: { summary: SummaryToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, addToolResult }) {
    if (!toolCall || toolCall.toolId !== 'summary') return;

    const parameters = toolCall.parameters as z.infer<typeof SummaryToolSchema>;
    logger.debug('Summary tool called — agent loop will terminate', { textLength: parameters.text.length });

    // Use addToolResult directly instead of executeToolCall, because executeToolCall auto-calls yieldToSelf which would cause one more unwanted round
    addToolResult({
      toolName: 'summary',
      parameters,
      result: parameters.text,
      duration: 0,
    });
    // Do NOT yieldToSelf — let the loop end naturally, yielding 'completed' status
  },
});

export const summaryTool = summaryDefinition.tool;
