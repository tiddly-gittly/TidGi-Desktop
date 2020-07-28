import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import electronFsBackend from 'i18next-electron-fs-backend';

i18n
  .use(electronFsBackend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: './app/localization/locales/{{lng}}/{{ns}}.json',
      addPath: './app/localization/locales/{{lng}}/{{ns}}.missing.json',
      ipcRenderer: window.api.i18nextElectronBackend, // important!
    },

    // other options you might configure
    debug: true,
    saveMissing: true,
    saveMissingTo: 'current',
    lng: 'en',
  });

export default i18n;
