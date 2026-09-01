import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import en from '../../../../../../localization/locales/en/agent.json';
import fr from '../../../../../../localization/locales/fr/agent.json';
import ja from '../../../../../../localization/locales/ja/agent.json';
import ru from '../../../../../../localization/locales/ru/agent.json';
import zhHans from '../../../../../../localization/locales/zh-Hans/agent.json';
import zhHant from '../../../../../../localization/locales/zh-Hant/agent.json';

describe('scheduled-task i18next resources', () => {
  it.each([
    ['en-US', 'en', en],
    ['fr-FR', 'fr', fr],
    ['ja-JP', 'ja', ja],
    ['ru-RU', 'ru', ru],
    ['zh-Hans-CN', 'zh_CN', zhHans],
    ['zh-Hant-TW', 'zh_TW', zhHant],
  ])('loads the complete %s cron locale directly through i18next', async (language, descriptionLocale, resource) => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: language, resources: { [language]: { agent: resource } } });

    const translated = i18n.getFixedT(language, 'agent')('EditAgent.ScheduleCronLocale', { returnObjects: true });

    expect(translated).toEqual(resource.EditAgent.ScheduleCronLocale);
    expect(translated).toMatchObject({ cronDescriptionText: descriptionLocale });
    expect(i18n.getFixedT(language, 'agent')('Tab.ScheduledTaskNextWake', { wakeTime: 'TIME' })).toContain('TIME');
    expect(i18n.getFixedT(language, 'agent')('Tab.ScheduledTaskMore', { count: 2 })).toContain('2');
  });
});
