/**
 * Message filtering utilities for duration-based context management
 */
import type { AgentInstanceMessage } from '../interface';

/**
 * Filter messages based on their duration settings
 * Messages with duration set will only be included if they are within the specified number of rounds from the current position
 * Special handling for tool call/result pairs: if a tool result is included, its corresponding tool call should also be included
 * @param messages Array of all messages
 * @returns Filtered array containing only messages that should be sent to AI
 */
export function filterMessagesByDuration(messages: AgentInstanceMessage[]): AgentInstanceMessage[] {
  // If no messages, return empty array
  if (messages.length === 0) return [];

  // Calculate the current round position (how many rounds have passed since each message)
  const filteredMessages: AgentInstanceMessage[] = [];
  const includedToolCalls = new Set<string>(); // Track which tool calls to force include

  // First pass: identify messages to include and collect tool calls that need to be force-included
  const messagesToInclude = new Map<string, AgentInstanceMessage>();

  // Iterate through messages from latest to oldest to calculate rounds
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    // Calculate rounds from current position (0 = current message, 1 = previous round, etc.)
    const roundsFromCurrent = messages.length - 1 - index;

    // Check if this message should be included based on duration
    let shouldInclude = false;

    // If duration is undefined or null, include the message (default behavior - persist indefinitely)
    if (message.duration === undefined || message.duration === null) {
      shouldInclude = true;
    } // If duration is 0, exclude from AI context (but still visible in UI)
    else if (message.duration === 0) {
      shouldInclude = false;
    } // If message is within its duration window, include it
    else if (roundsFromCurrent < message.duration) {
      shouldInclude = true;
    }

    if (shouldInclude) {
      messagesToInclude.set(message.id, message);

      // If this is a tool result, we need to ensure its corresponding tool call is also included
      if (message.metadata?.isToolResult && typeof message.metadata?.toolId === 'string') {
        includedToolCalls.add(message.metadata.toolId);
      }
    }
  }

  // Second pass: force include tool call messages for included tool results
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    if (
      message.metadata?.containsToolCall &&
      typeof message.metadata?.toolId === 'string' &&
      includedToolCalls.has(message.metadata.toolId) &&
      !messagesToInclude.has(message.id)
    ) {
      messagesToInclude.set(message.id, message);

      // Force-include debug log removed to reduce test output noise
    }
  }

  // Build final filtered array in original order
  for (const message of messages) {
    if (messagesToInclude.has(message.id)) {
      filteredMessages.push(message);
    }
  }

  return filteredMessages;
}

/**
 * Check if a message should be displayed with reduced opacity in UI
 * @param message The message to check
 * @param currentPosition The current position of the message in the full message array (0-based from start)
 * @param totalMessages Total number of messages
 * @returns true if the message should be semi-transparent
 */
export function isMessageExpiredForAI(
  message: AgentInstanceMessage,
  currentPosition: number,
  totalMessages: number,
): boolean {
  // If duration is undefined or null, message is always visible
  if (message.duration === undefined || message.duration === null) {
    return false;
  }

  // If duration is 0, message is never sent to AI (always expired)
  if (message.duration === 0) {
    return true;
  }

  // Calculate rounds from current position (how many rounds ago this message was)
  const roundsFromCurrent = totalMessages - 1 - currentPosition;

  // Message is expired if it's beyond its duration window
  return roundsFromCurrent >= message.duration;
}
