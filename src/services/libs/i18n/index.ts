import path from 'path';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';

import { LOCALIZATION_FOLDER, isDev } from '@services/constants/paths';
import bindI18nListener from './bindI18nListener';
import useDefaultLanguage from './useDefaultLanguage';

// init i18n is async, but our usage is basically await the electron app to start, so this is basically ok
void i18next.use(Backend).init({
  backend: {
    loadPath: path.join(LOCALIZATION_FOLDER, 'locales/{{lng}}/{{ns}}.json'),
    addPath: path.join(LOCALIZATION_FOLDER, 'locales/{{lng}}/{{ns}}.missing.json'),
  },

  debug: false,
  interpolation: { escapeValue: false },
  saveMissing: isDev,
  saveMissingTo: 'current',
  // namespace: 'translation',
  lng: 'zh_CN',
  fallbackLng: isDev ? false : 'en', // set to false when generating translation files locally
});

setTimeout(() => {
  bindI18nListener();
  void useDefaultLanguage(i18next);
}, 1);

export default i18next;
