import path from 'path';
import i18next, { TFuncKey, TOptions } from 'i18next';
import Backend from 'i18next-fs-backend';
import { isElectronDevelopment } from '@/constants/isElectronDevelopment';

import { LOCALIZATION_FOLDER } from '@/constants/paths';
import changeToDefaultLanguage from './useDefaultLanguage';
import { mainBindings, clearMainBindings } from './i18nMainBindings';

// Workaround for https://github.com/isaachinman/next-i18next/issues/1781
declare module 'i18next' {
  interface TFunction {
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    <TKeys extends TFuncKey = string, TInterpolationMap extends object = { [key: string]: any }>(
      key: TKeys,
      options?: TOptions<TInterpolationMap> | string,
    ): string;
  }
}

// init i18n is async, but our usage is basically await the electron app to start, so this is basically ok
// eslint-disable-next-line import/no-named-as-default-member
export const i18n = i18next.use(Backend);
export const t = (key: string): string => i18n.t(key) ?? key;

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
