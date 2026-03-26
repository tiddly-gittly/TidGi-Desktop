import type { ModelMessage } from 'ai';
import type { IPrompt } from './promptConcatSchema/prompts';

export interface PromptConcatPluginPreview {
  id: string;
  toolId?: string;
  caption?: string;
  [key: string]: unknown;
}

export interface PromptConcatStreamState {
  processedPrompts: IPrompt[];
  flatPrompts: ModelMessage[];
  step: 'plugin' | 'finalize' | 'flatten' | 'complete';
  currentPlugin?: PromptConcatPluginPreview;
  progress: number;
  isComplete: boolean;
}
