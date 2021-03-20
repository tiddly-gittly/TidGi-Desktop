import { useObservable } from 'beautiful-react-hooks';
import { useState } from 'react';
import { ITheme } from './interface';

export function useThemeObservable(): ITheme | undefined {
  const [theme, themeSetter] = useState<ITheme | undefined>();
  useObservable<ITheme | undefined>(window.observables.theme.theme$, themeSetter);
  return theme;
}
