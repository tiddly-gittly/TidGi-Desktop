/**
 * Desktop-specific AI config & prompt types.
 * Minimal survival of `promptConcat/promptConcatSchema` after migrating the runtime to memeloop.
 * Only keep what the remaining Desktop UI and services reference.
 */

export interface ModelSelection {
  provider: string;
  model: string;
  [key: string]: unknown;
}

export interface ModelParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  [key: string]: unknown;
}

export interface AiAPIConfig {
  default?: ModelSelection;
  embedding?: ModelSelection;
  speech?: ModelSelection;
  imageGeneration?: ModelSelection;
  transcriptions?: ModelSelection;
  free?: ModelSelection;
  modelParameters: ModelParameters;
  [key: string]: unknown;
}

/** @deprecated Use memeloop's AgentFrameworkConfig for runtime; keep here for Desktop-only UI/schema flows. */
export interface DesktopAgentFrameworkConfig {
  prompts?: unknown[];
  response?: unknown[];
  plugins?: unknown[];
  [key: string]: unknown;
}

/** Desktop UI alias for DesktopAgentFrameworkConfig — matches memeloop PromptNode[] for backward compat. */
export type AgentFrameworkConfig = DesktopAgentFrameworkConfig & { prompts?: import('memeloop').PromptNode[] };

/** Desktop UI IPrompt — mirrors memeloop PromptNode for schema editor/tree. */
export interface IPrompt {
  id: string;
  caption: string;
  enabled?: boolean;
  role?: 'system' | 'user' | 'assistant' | 'tool';
  tags?: string[];
  text?: string;
  children?: IPrompt[];
  source?: string[];
}

export interface AgentPromptDescription {
  id: string;
  api?: { provider: string; model: string };
  modelParameters?: ModelParameters;
  agentFrameworkConfig: DesktopAgentFrameworkConfig;
  aiApiConfig?: AiAPIConfig;
  [key: string]: unknown;
}

export interface PromptConcatPluginPreview {
  id: string;
  toolId?: string;
  caption?: string;
  [key: string]: unknown;
}

export interface PromptConcatStreamState {
  processedPrompts: unknown[];
  flatPrompts: unknown[];
  step: 'plugin' | 'finalize' | 'flatten' | 'complete';
  currentPlugin?: PromptConcatPluginPreview;
  progress?: number;
  isComplete: boolean;
}

/**
 * Desktop IPromptConcatTool — registered tools' plugin config shape.
 * Each tool registers its parameters under `${toolId}Param`.
 */
export interface IPromptConcatTool {
  [key: string]: unknown;
  id: string;
  caption?: string;
  content?: string;
  enabled?: boolean;
  forbidOverrides?: boolean;
  toolId: string;
  /** Per-tool approval configuration */
  approval?: {
    mode: 'auto' | 'confirm';
    allowPatterns?: string[];
    denyPatterns?: string[];
    timeoutMs?: number;
  };
  /** Per-tool execution timeout in ms */
  timeoutMs?: number;
}

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
