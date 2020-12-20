import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import electronFsBackend from './helpers/i18next-electron-fs-backend';
import { getIsDevelopment, getPreference } from './senders';
const isDevelopment = getIsDevelopment();
// @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
i18n
  // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'typeof Backend' is not assignabl... Remove this comment to see the full error message
  .use(electronFsBackend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: 'locales/{{lng}}/{{ns}}.json',
      addPath: 'locales/{{lng}}/{{ns}}.missing.json',
      ipcRenderer: (window as any).i18n.i18nextElectronBackend,
    },
    debug: isDevelopment,
    interpolation: { escapeValue: false },
    saveMissing: isDevelopment,
    saveMissingTo: 'current',
    namespace: 'translation',
    lng: getPreference('language'),
    fallbackLng: isDevelopment ? false : 'en',
  });
(window as any).i18n.i18nextElectronBackend.onLanguageChange((arguments_: any) => {
  i18n.changeLanguage(arguments_.lng, (error, t) => {
    if (error) {
      console.error(error);
    }
  });
});
export default i18n;
