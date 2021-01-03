import i18n from 'i18next';

import { container } from '@/services/container';
import { Preference } from '@/services/preferences';

export default async function useDefaultLanguage(i18nextInstance: typeof i18n): Promise<void> {
  const preferences = container.resolve(Preference);
  const language = preferences.get('language');
  if (typeof language === 'string') {
    await i18nextInstance.changeLanguage(language);
  }
}
