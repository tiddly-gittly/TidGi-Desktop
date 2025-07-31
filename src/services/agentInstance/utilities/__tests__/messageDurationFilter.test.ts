/**
 * Test for message duration filtering functionality
 */
import { describe, expect, it } from 'vitest';
import type { AgentInstanceMessage } from '../../interface';
import { filterMessagesByDuration, isMessageExpiredForAI } from '../messageDurationFilter';

// Helper function to create test messages
function createTestMessage(
  id: string,
  role: 'user' | 'assistant' = 'user',
  duration?: number,
): AgentInstanceMessage {
  return {
    id,
    agentId: 'test-agent',
    role,
    content: `Test message ${id}`,
    modified: new Date(),
    duration,
  };
}

describe('Message Duration Filtering', () => {
  describe('filterMessagesByDuration', () => {
    it('should return all messages when no duration is set', () => {
      const messages = [
        createTestMessage('1'),
        createTestMessage('2'),
        createTestMessage('3'),
      ];

      const filtered = filterMessagesByDuration(messages);
      expect(filtered).toHaveLength(3);
      expect(filtered.map(m => m.id)).toEqual(['1', '2', '3']);
    });

    it('should exclude messages with duration 0', () => {
      const messages = [
        createTestMessage('1', 'user', undefined), // Keep
        createTestMessage('2', 'user', 0), // Exclude
        createTestMessage('3', 'user', 1), // Keep (within duration)
      ];

      const filtered = filterMessagesByDuration(messages);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(m => m.id)).toEqual(['1', '3']);
    });

    it('should respect duration limits based on rounds from current', () => {
      const messages = [
        createTestMessage('1', 'user', 1), // Round 2 from current (exclude)
        createTestMessage('2', 'assistant', 1), // Round 1 from current (exclude)
        createTestMessage('3', 'user', 1), // Round 0 from current (include)
      ];

      const filtered = filterMessagesByDuration(messages);
      expect(filtered).toHaveLength(1);
      expect(filtered.map(m => m.id)).toEqual(['3']);
    });

    it('should handle mixed duration settings correctly', () => {
      const messages = [
        createTestMessage('1', 'user', undefined), // Always keep (undefined duration)
        createTestMessage('2', 'assistant', 5), // Keep (round 3 < duration 5)
        createTestMessage('3', 'user', 3), // Keep (round 2 < duration 3)
        createTestMessage('4', 'assistant', 1), // Exclude (round 1 >= duration 1)
        createTestMessage('5', 'user', 0), // Exclude (duration 0)
      ];

      const filtered = filterMessagesByDuration(messages);
      expect(filtered).toHaveLength(3);
      expect(filtered.map(m => m.id)).toEqual(['1', '2', '3']);
    });

    it('should return empty array for empty input', () => {
      const filtered = filterMessagesByDuration([]);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('isMessageExpiredForAI', () => {
    it('should return false for messages with undefined duration', () => {
      const message = createTestMessage('1', 'user', undefined);
      expect(isMessageExpiredForAI(message, 0, 3)).toBe(false);
      expect(isMessageExpiredForAI(message, 2, 3)).toBe(false);
    });

    it('should return true for messages with duration 0', () => {
      const message = createTestMessage('1', 'user', 0);
      expect(isMessageExpiredForAI(message, 0, 3)).toBe(true);
      expect(isMessageExpiredForAI(message, 2, 3)).toBe(true);
    });

    it('should correctly calculate expiration based on position and duration', () => {
      const message = createTestMessage('1', 'user', 2);

      // Position 2 in array of 3: rounds from current = 3-1-2 = 0 (< 2, not expired)
      expect(isMessageExpiredForAI(message, 2, 3)).toBe(false);

      // Position 1 in array of 3: rounds from current = 3-1-1 = 1 (< 2, not expired)
      expect(isMessageExpiredForAI(message, 1, 3)).toBe(false);

      // Position 0 in array of 3: rounds from current = 3-1-0 = 2 (>= 2, expired)
      expect(isMessageExpiredForAI(message, 0, 3)).toBe(true);
    });

    it('should handle edge cases correctly', () => {
      const message = createTestMessage('1', 'user', 1);

      // Single message array
      expect(isMessageExpiredForAI(message, 0, 1)).toBe(false);

      // Last message in array
      expect(isMessageExpiredForAI(message, 4, 5)).toBe(false);

      // First message in large array
      expect(isMessageExpiredForAI(message, 0, 5)).toBe(true);
    });
  });
});
