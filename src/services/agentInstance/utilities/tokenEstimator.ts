/**
 * Token Estimation Utilities
 *
 * Provides approximate token counting for context window management.
 * Default: character-based estimation (chars / 4).
 * The UI can optionally call provider's token count API for precise numbers.
 */
import type { ModelMessage } from 'ai';
import type { AgentInstanceMessage } from '../interface';
import type { TokenBreakdown } from '../tools/types';

/**
 * Approximate token count for a string.
 * Rough heuristic: ~4 characters per token for English/code, ~2 for CJK.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count CJK characters (they typically use ~1 token each)
  const cjkCount = (text.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g) || []).length;
  const nonCjkLength = text.length - cjkCount;
  // CJK: ~1 token per character, Latin/code: ~1 token per 4 characters
  return Math.ceil(cjkCount + nonCjkLength / 4);
}

/**
 * Estimate tokens for a ModelMessage (the flat prompt format sent to API).
 */
export function estimateModelMessageTokens(message: ModelMessage): number {
  if (typeof message.content === 'string') {
    return estimateTokens(message.content);
  }
  if (Array.isArray(message.content)) {
    return message.content.reduce((sum, part) => {
      if (typeof part === 'string') return sum + estimateTokens(part);
      if ('text' in part && typeof part.text === 'string') return sum + estimateTokens(part.text);
      // Image/audio parts — rough estimate
      return sum + 100;
    }, 0);
  }
  return 0;
}

/**
 * Compute a token breakdown from flat prompts (ModelMessage[]).
 * Categories:
 * - systemInstructions: role=system messages
 * - toolDefinitions: system messages containing tool definitions (heuristic: contains <tool or "tool_use")
 * - userMessages: role=user messages that are NOT tool results
 * - assistantMessages: role=assistant messages
 * - toolResults: role=user messages containing <functions_result> or role=tool
 */
export function computeTokenBreakdown(flatPrompts: ModelMessage[], contextWindowSize: number): TokenBreakdown {
  let systemInstructions = 0;
  let toolDefinitions = 0;
  let userMessages = 0;
  let assistantMessages = 0;
  let toolResults = 0;

  for (const message of flatPrompts) {
    const tokens = estimateModelMessageTokens(message);
    const content = typeof message.content === 'string' ? message.content : '';

    if (message.role === 'system') {
      // Heuristic: if system message contains tool schema markers, it's a tool definition
      if (content.includes('<tool_use') || content.includes('Tool:') || content.includes('"title":')) {
        toolDefinitions += tokens;
      } else {
        systemInstructions += tokens;
      }
    } else if (message.role === 'assistant') {
      assistantMessages += tokens;
    } else if (message.role === 'user') {
      if (content.includes('<functions_result>')) {
        toolResults += tokens;
      } else {
        userMessages += tokens;
      }
    } else {
      // tool or other roles
      toolResults += tokens;
    }
  }

  const total = systemInstructions + toolDefinitions + userMessages + assistantMessages + toolResults;

  return {
    systemInstructions,
    toolDefinitions,
    userMessages,
    assistantMessages,
    toolResults,
    total,
    limit: contextWindowSize,
  };
}

/**
 * Check if estimated tokens exceed safety threshold.
 * Returns the usage ratio (0.0 - 1.0+).
 */
export function getContextUsageRatio(breakdown: TokenBreakdown): number {
  if (breakdown.limit <= 0) return 0;
  return breakdown.total / breakdown.limit;
}

/**
 * Get messages that should be trimmed to fit within context window.
 * Returns IDs of the oldest non-system messages to remove.
 */
export function getMessagesToTrim(
  messages: AgentInstanceMessage[],
  currentTokens: number,
  targetTokens: number,
): string[] {
  if (currentTokens <= targetTokens) return [];

  const toRemove: string[] = [];
  let removed = 0;
  const needed = currentTokens - targetTokens;

  // Iterate from oldest to newest, skip system-ish messages
  for (const message of messages) {
    if (removed >= needed) break;
    if (message.role === 'user' || message.role === 'assistant' || message.role === 'tool') {
      const tokens = estimateTokens(message.content);
      toRemove.push(message.id);
      removed += tokens;
    }
  }

  return toRemove;
}
