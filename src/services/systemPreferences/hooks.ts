import { useObservable } from 'beautiful-react-hooks';
import { useState } from 'react';
import { IUsedElectionSettings } from './interface';

export function useSystemPreferenceObservable(): IUsedElectionSettings | undefined {
  const [systemPreference, systemPreferenceSetter] = useState<IUsedElectionSettings | undefined>();
  useObservable<IUsedElectionSettings | undefined>(window.service.systemPreference.systemPreference$, systemPreferenceSetter);
  return systemPreference;
}
