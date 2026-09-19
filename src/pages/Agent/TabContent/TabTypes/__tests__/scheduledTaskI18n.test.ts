import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import en from '../../../../../../localization/locales/en/agent.json';
import fr from '../../../../../../localization/locales/fr/agent.json';
import ja from '../../../../../../localization/locales/ja/agent.json';
import ru from '../../../../../../localization/locales/ru/agent.json';
import zhHans from '../../../../../../localization/locales/zh-Hans/agent.json';
import zhHant from '../../../../../../localization/locales/zh-Hant/agent.json';

describe('scheduled-task i18next resources', () => {
  it('keeps the cron locale object and schedule labels in parity across all supported languages', () => {
    const languages = [en, fr, ja, ru, zhHans, zhHant];
    const cronLocaleKeys = Object.keys(en.EditAgent.ScheduleCronLocale).sort();
    const scheduleLabelKeys = Object.keys(en.EditAgent)
      .filter(key => key.startsWith('Schedule') || key.startsWith('ActiveHours'))
      .sort();

    for (const resource of languages) {
      expect(Object.keys(resource.EditAgent.ScheduleCronLocale).sort()).toEqual(cronLocaleKeys);
      expect(Object.keys(resource.EditAgent).filter(key => key.startsWith('Schedule') || key.startsWith('ActiveHours')).sort())
        .toEqual(scheduleLabelKeys);
    }
  });

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
