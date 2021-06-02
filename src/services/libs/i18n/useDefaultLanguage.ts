import i18n from 'i18next';

import { container } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';

export default async function changeToDefaultLanguage(i18next: typeof i18n): Promise<void> {
  const preferences = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const language = await preferences.get('language');
  if (typeof language === 'string') {
    await i18next.changeLanguage(language);
  }
}
