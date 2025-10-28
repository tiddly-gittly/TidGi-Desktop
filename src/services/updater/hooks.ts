import useObservable from 'beautiful-react-hooks/useObservable';
import type { TFunction } from 'i18next';
import { useState } from 'react';

import type { IUpdaterMetaData } from './interface';
import { IUpdaterStatus } from './interface';

export function useUpdaterObservable(): IUpdaterMetaData | undefined {
  const [updaterMetaData, updaterMetaDataSetter] = useState<IUpdaterMetaData | undefined>();
  useObservable(window.observables.updater.updaterMetaData$, updaterMetaDataSetter);
  return updaterMetaData;
}

export function getUpdaterMessage(status: IUpdaterMetaData['status'], info: IUpdaterMetaData['info'], t: TFunction): string {
  if (status === IUpdaterStatus.checkingFailed) {
    return `${t('ErrorMessage')} ${info?.errorMessage ?? '-'}`;
  }
  if (status === IUpdaterStatus.updateAvailable) {
    return `v${info?.version ?? '-'}`;
  }
  return '';
}
