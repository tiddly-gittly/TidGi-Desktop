import { useState } from 'react';
import { useObservable } from 'beautiful-react-hooks';

import { IUpdaterMetaData } from './interface';

export function useUpdaterObservable(): IUpdaterMetaData | undefined {
  const [updaterMetaData, updaterMetaDataSetter] = useState<IUpdaterMetaData | undefined>();
  useObservable(window.observables.updater.updaterMetaData$, updaterMetaDataSetter as any);
  return updaterMetaData;
}
