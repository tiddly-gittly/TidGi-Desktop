import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Backend as ElectronFsBackend } from './i18next-electron-fs-backend';

/**
 * Don't forget `src/services/libs/i18n/index.ts`
 */
export async function initRendererI18N(): Promise<void> {
  const isDevelopment = await window.service.context.get('isDevelopment');
  const language = await window.service.preference.get('language');
  await i18next
    .use(ElectronFsBackend)
    .use(initReactI18next)
    .init({
      backend: {
        loadPath: 'locales/{{lng}}/{{ns}}.json',
      },
      debug: false, // isDevelopment,
      defaultNS: ['translation', 'agent'],
      interpolation: { escapeValue: false },
      saveMissing: false,
      lng: language,
      fallbackLng: isDevelopment ? false : 'en',
    });
  window.i18n.i18nextElectronBackend.onLanguageChange(async (language: { lng: string }) => {
    await i18next.changeLanguage(language.lng, (error?: Error) => {
      if (error) {
        console.error(error);
      }
    });
  });
}
