import { AgentPromptDescription } from '../../promptConcat/promptConcatSchema';
import { AgentHandlerContext } from '../type';

/**
 * Result returned by continue round handlers
 */
export interface ContinueRoundResult {
  /** Whether to continue with another round of LLM generation */
  continue: boolean;
  /** Optional message to add to the conversation before next round */
  newMessage?: string;
  /** Reason for the continue decision (for logging) */
  reason?: string;
}

/**
 * Handler function for determining whether to continue with another round
 */
export type ContinueRoundHandler = (
  agentConfig: AgentPromptDescription,
  llmResponse: string,
  context: AgentHandlerContext,
) => Promise<ContinueRoundResult>;

/**
 * Configuration for continue round handlers
 */
export interface ContinueRoundHandlerConfig {
  id: string;
  handler: ContinueRoundHandler;
  priority: number; // Lower numbers run first
  enabled: boolean;
}
