import useObservable from 'beautiful-react-hooks/useObservable';
import { useState } from 'react';
import type { ITheme } from './interface';

export function useThemeObservable(): ITheme | undefined {
  const [theme, themeSetter] = useState<ITheme | undefined>();
  useObservable(window.observables.theme.theme$, themeSetter as unknown as (value: ITheme | undefined) => void);
  return theme;
}
