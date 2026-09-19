import { describe, expect, it } from 'vitest';
import { wikiAgentI18n } from './localization';

describe('MemeLoop Wiki renderer localization', () => {
  it.each([
    ['en', 'API key'],
    ['fr', 'Clé API'],
    ['ja', 'APIキー'],
    ['ru', 'API-ключ'],
    ['zh-Hans', 'API 密钥'],
    ['zh-Hant', 'API 密鑰'],
  ])('loads the standalone %s Agent namespace before the first widget render', (locale, expectedFragment) => {
    const translate = wikiAgentI18n.getFixedT(locale, 'agent');
    expect(translate('Chat.ConfigError.MissingAPIKeyError', { provider: 'example' })).toContain(expectedFragment);
  });
});
