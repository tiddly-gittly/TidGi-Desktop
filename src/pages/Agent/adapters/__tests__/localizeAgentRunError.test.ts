import type { AgentRunError } from 'memeloop';
import { describe, expect, it } from 'vitest';

import { localizeAgentRunError } from '../localizeAgentRunError';

const translate = (key: string, options?: Record<string, unknown>) => `${key}:${JSON.stringify(options ?? {})}`;

describe('localizeAgentRunError', () => {
  it('keeps both new base messages complete when optional localization parameters are absent', () => {
    expect(localizeAgentRunError(runError('USER_MESSAGE_TOO_LARGE', 'agent.run.error.userMessageTooLarge'), translate))
      .toContain('agent.run.error.userMessageTooLarge:');
    const pending = localizeAgentRunError(runError('CONTEXT_COMPACTION_PENDING', 'agent.run.error.contextCompactionPending'), translate);
    expect(pending).toContain('agent.run.error.contextCompactionPending:');
    expect(pending).not.toContain('Progress');
  });

  it('appends bounded size and compaction progress details only when available', () => {
    const tooLarge = runError('USER_MESSAGE_TOO_LARGE', 'agent.run.error.userMessageTooLarge', { requested: 300, limit: 200 });
    expect(localizeAgentRunError(tooLarge, translate)).toContain('userMessageTooLargeDetail');
    const pending = runError('CONTEXT_COMPACTION_PENDING', 'agent.run.error.contextCompactionPending', {
      processedMessages: 120,
      remainingEstimate: 30,
    });
    expect(localizeAgentRunError(pending, translate)).toContain('contextCompactionPendingProgressEstimate');
  });

  it('uses the host configuration message for a missing runtime model selection', () => {
    const error = {
      code: 'PROVIDER_CONFIGURATION_MISSING',
      messageKey: 'agent.run.error.providerConfigurationMissing',
      retryable: false,
      diagnosticId: 'diagnostic-configuration',
      localizedParams: { settingField: 'model' },
      settingTarget: { kind: 'runtime', section: 'agent' },
    } as AgentRunError;

    expect(localizeAgentRunError(error, translate)).toBe('Chat.ConfigError.NoDefaultModel:{}');
  });
});

function runError(
  code: string,
  messageKey: string,
  localizedParams?: Record<string, number>,
): AgentRunError {
  return {
    code,
    messageKey,
    retryable: true,
    diagnosticId: 'diagnostic-1',
    ...(localizedParams === undefined ? {} : { localizedParams }),
  } as AgentRunError;
}
