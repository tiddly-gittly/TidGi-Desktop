/**
 * Message filtering utilities for duration-based context management
 */
import type { AgentInstanceMessage } from '../interface';

/**
 * Filter messages based on their duration settings
 * Messages with duration set will only be included if they are within the specified number of rounds from the current position
 * @param messages Array of all messages
 * @returns Filtered array containing only messages that should be sent to AI
 */
export function filterMessagesByDuration(messages: AgentInstanceMessage[]): AgentInstanceMessage[] {
  // If no messages, return empty array
  if (messages.length === 0) return [];

  // Calculate the current round position (how many rounds have passed since each message)
  const filteredMessages: AgentInstanceMessage[] = [];

  // Iterate through messages from latest to oldest to calculate rounds
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    // Calculate rounds from current position (0 = current message, 1 = previous round, etc.)
    const roundsFromCurrent = messages.length - 1 - index;

    // If duration is undefined or null, include the message (default behavior - persist indefinitely)
    if (message.duration === undefined || message.duration === null) {
      filteredMessages.unshift(message);
      continue;
    }

    // If duration is 0, exclude from AI context (but still visible in UI)
    if (message.duration === 0) {
      continue;
    }

    // If message is within its duration window, include it
    if (roundsFromCurrent < message.duration) {
      filteredMessages.unshift(message);
    }
    // Otherwise, message has expired and should not be sent to AI
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
  // If duration is undefined, message never expires
  if (message.duration === undefined || message.duration === null) {
    return false;
  }

  // If duration is 0, message is immediately expired
  if (message.duration === 0) {
    return true;
  }

  // Calculate rounds from current position
  const roundsFromCurrent = totalMessages - 1 - currentPosition;

  // Message is expired if it's beyond its duration window
  return roundsFromCurrent >= message.duration;
}
