import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import electronFsBackend from './helpers/i18next-electron-fs-backend';
import { getIsDevelopment } from './senders';

const isDev = getIsDevelopment();
i18n
  .use(electronFsBackend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: 'locales/{{lng}}/{{ns}}.json',
      addPath: 'locales/{{lng}}/{{ns}}.missing.json',
      ipcRenderer: window.i18n.i18nextElectronBackend,
    },

    debug: isDev,
    interpolation: { escapeValue: false },
    saveMissing: isDev,
    saveMissingTo: 'current',
    namespace: 'translation',
    lng: 'zh_CN',
    fallbackLng: isDev ? false : 'en', // set to false when generating translation files locally
  });

window.i18n.i18nextElectronBackend.onLanguageChange(arguments_ => {
  i18n.changeLanguage(arguments_.lng, (error, t) => {
    if (error) {
      console.error(error);
    }
  });
});

export default i18n;
