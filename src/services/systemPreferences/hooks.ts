import useObservable from 'beautiful-react-hooks/useObservable';
import i18n from 'i18next';
import { useState } from 'react';

import { IUsedElectionSettings } from './interface';

export function useSystemPreferenceObservable(): IUsedElectionSettings | undefined {
  const [systemPreference, systemPreferenceSetter] = useState<IUsedElectionSettings | undefined>();
  useObservable(window.observables.systemPreference.systemPreference$, systemPreferenceSetter as any);
  return systemPreference;
}

export function getOpenAtLoginString(openAtLogin: IUsedElectionSettings['openAtLogin']): string {
  if (openAtLogin === 'yes-hidden') return i18n.t('Preference.OpenAtLoginMinimized');
  if (openAtLogin === 'yes') return i18n.t('Yes');
  return i18n.t('No');
}
