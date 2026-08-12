import { describe, expect, it } from 'vitest';

import { getConfigErrorPresentation, serializeAIError } from '../configErrorPresentation';

describe('configuration error presentation', () => {
  it('normalizes a raw missing-key error and infers its provider', () => {
    expect(getConfigErrorPresentation('API key for siliconflow not found')).toEqual({
      fallbackMessage: 'API key for siliconflow not found',
      key: 'MissingAPIKeyError',
      params: { provider: 'siliconflow' },
    });
  });

  it('preserves structured provider parameters and stores a canonical i18n key', () => {
    const error = Object.assign(new Error('API key for siliconflow not found'), {
      code: 'MISSING_API_KEY',
      name: 'MissingAPIKeyError',
      provider: 'siliconflow',
    });

    expect(serializeAIError(error)).toEqual({
      content: 'Chat.ConfigError.MissingAPIKeyError',
      detail: {
        code: 'MISSING_API_KEY',
        message: 'API key for siliconflow not found',
        name: 'MissingAPIKeyError',
        params: { provider: 'siliconflow' },
        provider: 'siliconflow',
      },
    });
  });

  it('leaves unrelated runtime errors untouched', () => {
    expect(serializeAIError(new Error('socket disconnected'))).toMatchObject({
      content: 'socket disconnected',
      detail: { message: 'socket disconnected', name: 'Error' },
    });
  });
});
