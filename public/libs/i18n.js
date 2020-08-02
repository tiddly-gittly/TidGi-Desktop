const isDev = require('electron-is-dev');
const path = require('path');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');

const { LOCALIZATION_FOLDER } = require('../constants/paths');

i18next.use(Backend).init({
  backend: {
    loadPath: path.join(LOCALIZATION_FOLDER, 'locales/{{lng}}/{{ns}}.json'),
    addPath: path.join(LOCALIZATION_FOLDER, 'locales/{{lng}}/{{ns}}.missing.json'),
  },

  debug: false,
  interpolation: { escapeValue: false },
  saveMissing: isDev,
  saveMissingTo: 'current',
  namespace: 'translation',
  lng: 'zh_CN',
  fallbackLng: isDev ? false : 'en', // set to false when generating translation files locally
});

module.exports = i18next;
