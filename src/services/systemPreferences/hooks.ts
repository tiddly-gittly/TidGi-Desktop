import { useObservable } from 'beautiful-react-hooks';
import { useState } from 'react';
import { IUsedElectionSettings } from './interface';

export function useSystemPreferenceObservable(): IUsedElectionSettings | undefined {
  const [systemPreference, systemPreferenceSetter] = useState<IUsedElectionSettings | undefined>();
  useObservable<IUsedElectionSettings | undefined>(window.observables.systemPreference.systemPreference$, systemPreferenceSetter);
  return systemPreference;
}

export function getOpenAtLoginString(openAtLogin: IUsedElectionSettings['openAtLogin']): string {
  if (openAtLogin === 'yes-hidden') return 'Yes, but minimized';
  if (openAtLogin === 'yes') return 'Yes';
  return 'No';
}
