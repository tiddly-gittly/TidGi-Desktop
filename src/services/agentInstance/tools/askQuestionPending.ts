/**
 * Ask Question Pending Infrastructure
 *
 * Manages promise-based blocking for ask-question tool calls.
 * When the agent asks a question, the agent loop blocks until the user responds.
 * The user's answer is returned as a tool result (same turn), not as a new user message.
 */
import { logger } from '@services/libs/log';

/**
 * Pending ask-question requests waiting for user response.
 * Key: questionId, Value: resolve function to unblock execution.
 */
const pendingQuestions = new Map<string, {
  agentId: string;
  resolve: (answer: string) => void;
}>();

/**
 * Request an answer from the user. Returns a promise that resolves when the user responds.
 * The agent loop blocks on this promise until the UI calls `resolveAskQuestion()`.
 *
 * @param questionId Unique ID for this question (embedded in tool result for UI)
 * @param agentId The agent instance ID
 * @param timeoutMs Timeout in ms (0 = no timeout). On timeout, returns empty string.
 */
export function requestAskQuestionResponse(
  questionId: string,
  agentId: string,
  timeoutMs: number = 300_000, // 5 minutes default timeout
): Promise<string> {
  return new Promise<string>((resolve) => {
    pendingQuestions.set(questionId, { agentId, resolve });

    // Timeout — return empty string to let agent continue
    if (timeoutMs > 0) {
      setTimeout(() => {
        if (pendingQuestions.has(questionId)) {
          pendingQuestions.delete(questionId);
          logger.info('Ask question timed out, returning empty response', { questionId, agentId });
          resolve('');
        }
      }, timeoutMs);
    }
  });
}

/**
 * Resolve a pending ask-question (called from UI via IPC).
 */
export function resolveAskQuestion(questionId: string, answer: string): void {
  const pending = pendingQuestions.get(questionId);
  if (pending) {
    pendingQuestions.delete(questionId);
    pending.resolve(answer);
    logger.debug('Ask question resolved', { questionId, answer: answer.substring(0, 100) });
  } else {
    logger.warn('No pending ask question found', { questionId });
  }
}

/**
 * Cancel all pending questions for an agent (on agent cancel/close).
 */
export function cancelPendingQuestions(agentId: string): void {
  for (const [id, pending] of pendingQuestions) {
    if (pending.agentId === agentId) {
      pendingQuestions.delete(id);
      pending.resolve('');
    }
  }
}
