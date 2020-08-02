import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import electronFsBackend from 'i18next-electron-fs-backend';

const ipcRenderer = window.api.i18nextElectronBackend;
console.log(ipcRenderer)
i18n
  .use(electronFsBackend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: './localization/locales/{{lng}}/{{ns}}.json',
      addPath: './localization/locales/{{lng}}/{{ns}}.missing.json',
      ipcRenderer,
    },

    debug: true,
    saveMissing: true,
    saveMissingTo: 'current',
    namespace: 'translation',
    lng: 'en',
    fallbackLng: false, // set to false when generating translation files locally
  });

window.api.i18nextElectronBackend.onLanguageChange(arguments_ => {
  i18n.changeLanguage(arguments_.lng, (error, t) => {
    if (error) {
      console.error(error);
    }
  });
});

export default i18n;
