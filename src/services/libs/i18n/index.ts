import { isElectronDevelopment } from '@/constants/isElectronDevelopment';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';

import { LOCALIZATION_FOLDER } from '@/constants/paths';
import { clearMainBindings, mainBindings } from './i18nMainBindings';
import changeToDefaultLanguage from './useDefaultLanguage';

// init i18n is async, but our usage is basically await the electron app to start, so this is basically ok
// eslint-disable-next-line import/no-named-as-default-member
export const i18n = i18next.use(Backend);

export async function initRendererI18NHandler(): Promise<void> {
  await i18n.init({
    backend: {
      loadPath: path.join(LOCALIZATION_FOLDER, 'locales/{{lng}}/{{ns}}.json'),
      addPath: path.join(LOCALIZATION_FOLDER, 'locales/{{lng}}/{{ns}}.missing.json'),
    },

    debug: false,
    interpolation: { escapeValue: false },
    saveMissing: isElectronDevelopment,
    saveMissingTo: 'current',
    // namespace: 'translation',
    lng: 'zh_CN',
    fallbackLng: isElectronDevelopment ? false : 'en', // set to false when generating translation files locally
  });
  clearMainBindings();
  mainBindings();
  await changeToDefaultLanguage(i18next);
}
