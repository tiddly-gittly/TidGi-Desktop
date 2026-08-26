import { describe, expect, it } from 'vitest';

import { extractErrorDetails } from '../errorHandlers';
import { getProviderHttpStatus, parseProviderError } from '../errors';

describe('structured provider errors', () => {
  it.each(
    [
      [401, 'AUTHENTICATION_FAILED'],
      [403, 'AUTHENTICATION_FAILED'],
      [404, 'MODEL_NOT_FOUND'],
      [429, 'RATE_LIMIT_EXCEEDED'],
    ] as const,
  )('normalizes HTTP %i without parsing response text', (status, code) => {
    expect(extractErrorDetails({ response: { status }, message: 'untrusted upstream body' }, 'provider-a'))
      .toMatchObject({ code, provider: 'provider-a' });
  });

  it('finds a bounded structured status through an SDK cause chain', () => {
    expect(getProviderHttpStatus({ cause: { cause: { statusCode: 429 } } })).toBe(429);
  });

  it('does not classify digits or English phrases embedded in an arbitrary message', () => {
    const raw = new Error('401 API key not found; secret response body');
    expect(parseProviderError(raw, 'provider-a')).toBe(raw);
    expect(extractErrorDetails(raw, 'provider-a')).toEqual({
      name: 'AIProviderError',
      code: 'UNKNOWN_ERROR',
      provider: 'provider-a',
      message: 'Chat.ConfigError.ProviderUnavailable',
    });
  });
});
