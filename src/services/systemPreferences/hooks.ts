import useObservable from 'beautiful-react-hooks/useObservable';
import type { TFunction } from 'i18next';
import { useState } from 'react';

import type { IUsedElectionSettings } from './interface';

export function useSystemPreferenceObservable(): IUsedElectionSettings | undefined {
  const [systemPreference, systemPreferenceSetter] = useState<IUsedElectionSettings | undefined>();
  useObservable(window.observables.systemPreference.systemPreference$, systemPreferenceSetter);
  return systemPreference;
}

export function getOpenAtLoginString(openAtLogin: IUsedElectionSettings['openAtLogin'], t: TFunction): string {
  if (openAtLogin === 'yes-hidden') return t('Preference.OpenAtLoginMinimized');
  if (openAtLogin === 'yes') return t('Yes');
  return t('No');
}
