import useObservable from 'beautiful-react-hooks/useObservable';
import { useState } from 'react';
import { IPreferences } from './interface';

export function usePreferenceObservable(): IPreferences | undefined {
  const [preference, preferenceSetter] = useState<IPreferences | undefined>();
  useObservable(window.observables.preference.preference$, preferenceSetter as any);
  return preference;
}
