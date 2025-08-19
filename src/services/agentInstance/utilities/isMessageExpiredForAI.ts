import { AgentInstanceMessage } from '../interface';

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
