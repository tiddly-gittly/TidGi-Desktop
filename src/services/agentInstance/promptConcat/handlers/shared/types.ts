/**
 * Type definitions for prompt concat utilities
 */

/**
 * Agent response interface
 * Represents a structured response from an agent
 */
export interface AgentResponse {
  id: string;
  text?: string;
  enabled?: boolean;
  children?: AgentResponse[];
}

/**
 * Agent response part interface
 * Represents a part of a structured agent response
 */
export interface AgentResponsePart {
  id: string;
  text?: string;
  children?: AgentResponsePart[];
}

/**
 * Prompt part interface
 */
export interface PromptPart {
  id: string;
  text?: string;
  children?: PromptPart[];
  enabled?: boolean;
}

/**
 * Trigger configuration interface
 */
export interface TriggerConfig {
  search?: string;
  randomChance?: number;
  filter?: string;
  model?: {
    preset?: string;
    system?: string;
    user?: string;
  };
}

/**
 * Tool calling parameter interface
 */
export interface ToolCallingParameter {
  targetId: string;
  match: string;
}

/**
 * Auto reroll parameter interface
 */
export interface AutoRerollParameter {
  targetId: string;
  search: string;
  maxRetry: number;
}

/**
 * Auto reply parameter interface
 */
export interface AutoReplyParameter {
  targetId: string;
  text: string;
  trigger: TriggerConfig;
  maxAutoReply: number;
}

/**
 * Full replacement parameter interface
 */
export interface FullReplacementParameter {
  targetId: string;
  sourceType: string;
}

/**
 * Response dynamic modification interface
 */
export interface ResponseDynamicModification {
  id: string;
  caption?: string;

  dynamicModificationType?: 'fullReplacement';
  fullReplacementParam?: FullReplacementParameter;

  responseProcessingType?: 'toolCalling';
  toolCallingParam?: ToolCallingParameter;
  autoRerollParam?: AutoRerollParameter;
  autoReplyParam?: AutoReplyParameter;

  forbidOverrides?: boolean;
}
