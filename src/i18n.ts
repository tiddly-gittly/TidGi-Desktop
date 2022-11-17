/* eslint-disable import/no-named-as-default-member */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Backend as ElectronFsBackend } from './services/libs/i18n/i18next-electron-fs-backend';

export async function initI18N(): Promise<void> {
  const isDevelopment = await window.service.context.get('isDevelopment');
  const language = await window.service.preference.get('language');
  await i18n
    .use(ElectronFsBackend)
    .use(initReactI18next)
    .init({
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      backend: {
        loadPath: 'locales/{{lng}}/{{ns}}.json',
        addPath: 'locales/{{lng}}/{{ns}}.missing.json',
      },
      debug: isDevelopment,
      interpolation: { escapeValue: false },
      saveMissing: isDevelopment,
      saveMissingTo: 'current',
      // namespace: 'translation',
      lng: language,
      fallbackLng: isDevelopment ? false : 'en',
    });
  window.i18n.i18nextElectronBackend.onLanguageChange(async (language: { lng: string }) => {
    await i18n.changeLanguage(language.lng, (error?: Error) => {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (error) {
        console.error(error);
      }
    });
  });
}
