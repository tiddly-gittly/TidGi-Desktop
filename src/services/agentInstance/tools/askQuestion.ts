/**
 * Ask Question Tool — pauses the agent loop to ask the user a clarifying question.
 * Renders inline UI with options for the user to respond.
 */
import { t } from '@services/libs/i18n/placeholder';
import { logger } from '@services/libs/log';
import { z } from 'zod/v4';
import { registerToolDefinition } from './defineTool';

export const AskQuestionParameterSchema = z.object({
  toolListPosition: z.object({
    targetId: z.string().meta({ title: t('Schema.Common.ToolListPosition.TargetIdTitle'), description: t('Schema.Common.ToolListPosition.TargetId') }),
    position: z.enum(['before', 'after']).meta({ title: t('Schema.Common.ToolListPosition.PositionTitle'), description: t('Schema.Common.ToolListPosition.Position') }),
  }).optional().meta({ title: t('Schema.Common.ToolListPositionTitle'), description: t('Schema.Common.ToolListPosition.Description') }),
}).meta({ title: 'Ask Question Config', description: 'Configuration for the ask-question tool' });

export type AskQuestionParameter = z.infer<typeof AskQuestionParameterSchema>;

const AskQuestionToolSchema = z.object({
  question: z.string().meta({
    title: 'Question',
    description: 'The question to ask the user.',
  }),
  options: z.array(z.object({
    label: z.string().meta({ title: 'Label', description: 'Display text for this option' }),
    description: z.string().optional().meta({ title: 'Description', description: 'Optional longer description' }),
  })).optional().meta({
    title: 'Options',
    description: 'Optional list of predefined options for the user to choose from. If omitted, user can type a free-form response.',
  }),
  allowFreeform: z.boolean().optional().default(true).meta({
    title: 'Allow free-form input',
    description: 'Whether the user can type a custom response in addition to predefined options.',
  }),
}).meta({
  title: 'ask-question',
  description: 'Pause and ask the user a clarifying question. The user will see the question with optional clickable choices. Their answer will be sent as the next message.',
  examples: [
    { question: 'Which wiki workspace should I create the note in?', options: [{ label: 'My Wiki' }, { label: 'Work Wiki' }], allowFreeform: true },
    { question: 'What format do you prefer for the output?', options: [{ label: 'Wikitext' }, { label: 'Plain text' }, { label: 'JSON' }] },
  ],
});

const askQuestionDefinition = registerToolDefinition({
  toolId: 'askQuestion',
  displayName: 'Ask Question',
  description: 'Pause to ask the user a clarifying question with optional choices',
  configSchema: AskQuestionParameterSchema,
  llmToolSchemas: { 'ask-question': AskQuestionToolSchema },

  onProcessPrompts({ config, injectToolList }) {
    const pos = config.toolListPosition;
    if (!pos?.targetId) return;
    injectToolList({ targetId: pos.targetId, position: pos.position || 'after' });
  },

  async onResponseComplete({ toolCall, addToolResult, agentFrameworkContext: _agentFrameworkContext }) {
    if (!toolCall || toolCall.toolId !== 'ask-question') return;

    const parameters = toolCall.parameters as z.infer<typeof AskQuestionToolSchema>;
    logger.debug('Ask question tool called', { question: parameters.question, optionCount: parameters.options?.length });

    // Add the question as a tool result with special metadata for the frontend renderer
    addToolResult({
      toolName: 'ask-question',
      parameters,
      result: JSON.stringify({
        type: 'ask-question',
        question: parameters.question,
        options: parameters.options,
        allowFreeform: parameters.allowFreeform ?? true,
      }),
      duration: 0, // Visible in UI but excluded from future AI context once answered
    });

    // Do NOT yieldToSelf — return control to human so they can answer
    // The agent status will be set to 'input-required' by the framework
    logger.debug('Ask question: returning control to user for answer');
  },
});

export const askQuestionTool = askQuestionDefinition.tool;
