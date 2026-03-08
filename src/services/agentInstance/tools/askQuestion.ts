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
  inputType: z.enum(['single-select', 'multi-select', 'text']).optional().default('single-select').meta({
    title: 'Input type',
    description: 'How the user answers: "single-select" shows option buttons (pick one), "multi-select" shows checkboxes (pick many), "text" shows only a text box.',
  }),
  options: z.array(z.object({
    label: z.string().meta({ title: 'Label', description: 'Display text for this option' }),
    description: z.string().optional().meta({ title: 'Description', description: 'Optional longer description' }),
  })).optional().meta({
    title: 'Options',
    description: 'Predefined options for the user. Required for single-select and multi-select, ignored for text input type.',
  }),
  allowFreeform: z.boolean().optional().default(true).meta({
    title: 'Allow free-form input',
    description: 'Whether the user can type a custom response in addition to predefined options. Always true for text input type.',
  }),
}).meta({
  title: 'ask-question',
  description:
    "Pause and ask the user a clarifying question. Supports single-select (radio buttons), multi-select (checkboxes), or text-only input. The user's answer is sent as the next message.",
  examples: [
    { question: 'Which wiki workspace?', inputType: 'single-select', options: [{ label: 'My Wiki' }, { label: 'Work Wiki' }], allowFreeform: true },
    { question: 'Which tags to apply?', inputType: 'multi-select', options: [{ label: 'journal' }, { label: 'important' }, { label: 'todo' }] },
    { question: 'Describe the changes you want:', inputType: 'text' },
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

  async onResponseComplete({ toolCall, addToolResult, yieldToHuman }) {
    if (!toolCall || toolCall.toolId !== 'ask-question') return;

    const parameters = toolCall.parameters as z.infer<typeof AskQuestionToolSchema>;
    const questionId = `ask-q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    logger.debug('Ask question tool called', { questionId, question: parameters.question, optionCount: parameters.options?.length });

    // Add the question as a tool result with special metadata for the frontend renderer.
    // Include questionId so the UI can resolve it via IPC (resolveAskQuestion).
    addToolResult({
      toolName: 'ask-question',
      parameters,
      result: JSON.stringify({
        type: 'ask-question',
        questionId,
        question: parameters.question,
        inputType: parameters.inputType ?? 'single-select',
        options: parameters.options,
        allowFreeform: parameters.allowFreeform ?? true,
      }),
      duration: 3,
    });

    // Signal the framework to set status to 'input-required' so the UI can render the question.
    // When the user answers, resolveAskQuestion() will inject the answer as a tool result
    // and resume the agent loop in the same turn (no new user message).
    yieldToHuman();
    logger.debug('Ask question: yielding to user for answer', { questionId });
  },
});

export const askQuestionTool = askQuestionDefinition.tool;
