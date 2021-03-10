import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Backend as ElectronFsBackend } from './services/libs/i18n/i18next-electron-fs-backend';

export async function initI18N(): Promise<void> {
  const isDevelopment = (await window.service.context.get('isDevelopment')) as boolean;
  await i18n
    .use(ElectronFsBackend)
    .use(initReactI18next)
    .init({
      backend: {
        loadPath: 'locales/{{lng}}/{{ns}}.json',
        addPath: 'locales/{{lng}}/{{ns}}.missing.json',
        ipcRenderer: window.i18n.i18nextElectronBackend,
      },
      debug: isDevelopment,
      interpolation: { escapeValue: false },
      saveMissing: isDevelopment,
      saveMissingTo: 'current',
      // namespace: 'translation',
      lng: 'zh_CN', // we switch to language set in preference later, in src/main.ts
      fallbackLng: isDevelopment ? false : 'en',
    });
  window.i18n.i18nextElectronBackend.onLanguageChange(async (language: string) => {
    await i18n.changeLanguage(language, (error?: Error) => {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (error) {
        console.error(error);
      }
    });
  });
}
