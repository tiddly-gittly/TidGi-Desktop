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

export interface AgentFrameworkConfig {
  prompts?: unknown[];
  response?: unknown[];
  plugins?: unknown[];
  [key: string]: unknown;
}

export interface AgentPromptDescription {
  id: string;
  agentFrameworkConfig: AgentFrameworkConfig;
  aiApiConfig?: AiAPIConfig;
  [key: string]: unknown;
}
