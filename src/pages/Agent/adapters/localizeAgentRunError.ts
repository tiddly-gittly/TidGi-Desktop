import type { AgentRunError } from 'memeloop';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ExtendedLocalizationParameters = NonNullable<AgentRunError['localizedParams']> & {
  processedMessages?: number;
  remainingEstimate?: number;
  requested?: number;
  limit?: number;
};

/** Keep the base error readable when optional progress metadata is absent. */
export function localizeAgentRunError(error: AgentRunError, t: Translate): string {
  const parameters: ExtendedLocalizationParameters | undefined = error.localizedParams;
  const code: string = error.code;
  const interpolation: Record<string, unknown> = { ...(parameters ?? {}) };
  const base = t(error.messageKey, { defaultValue: code, ...interpolation });
  if (
    code === 'USER_MESSAGE_TOO_LARGE' &&
    Number.isSafeInteger(parameters?.requested) &&
    Number.isSafeInteger(parameters?.limit)
  ) {
    return `${base} ${t('agent.run.error.userMessageTooLargeDetail', interpolation)}`;
  }
  if (code !== 'CONTEXT_COMPACTION_PENDING' || !Number.isSafeInteger(parameters?.processedMessages)) return base;
  const detailKey = Number.isSafeInteger(parameters?.remainingEstimate)
    ? 'agent.run.error.contextCompactionPendingProgressEstimate'
    : 'agent.run.error.contextCompactionPendingProgress';
  return `${base} ${t(detailKey, interpolation)}`;
}
