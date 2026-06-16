/**
 * Desktop-specific helpers for prompt-concat UI forms.
 * All shared types (AiAPIConfig, AgentFrameworkConfig, PromptConcatStreamState, etc.)
 * live in memeloop and are re-exported here only for legacy import paths.
 */

export type { AgentFrameworkConfig, AgentPromptDescription, AiAPIConfig, PromptConcatPluginPreview, PromptConcatStreamState, PromptNode as IPrompt } from 'memeloop';

/** Inline replacement for deleted promptConcatSchema/jsonSchema.ts. */
export function getPromptConcatAgentFrameworkConfigJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      prompts: { type: 'array', items: { type: 'object' } },
      response: { type: 'array', items: { type: 'object' } },
      plugins: { type: 'array', items: { type: 'object' } },
    },
  };
}
