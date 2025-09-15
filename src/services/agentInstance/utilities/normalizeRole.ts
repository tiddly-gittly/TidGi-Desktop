// Intentionally keep minimal logic and export named function for easy jest/vitest mocking
import type { IPrompt } from '../promptConcat/promptConcatSchema';

/**
 * Convert tool role messages to user role for API compatibility
 * I find if there are APIs doesn't accept 'tool' role, and it won't return anything when API calls.
 * @param role any app specific role string
 * @returns OpenAI API compatible role
 */
export function normalizeRole(role: string): NonNullable<IPrompt['role']> {
  if (role === 'agent') return 'assistant' as const;
  if (role === 'user' || role === 'assistant' || role === 'system') return role as NonNullable<IPrompt['role']>;
  return 'user' as const;
}
