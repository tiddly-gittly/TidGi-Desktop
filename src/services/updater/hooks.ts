import { useState } from 'react';
import { useObservable } from 'beautiful-react-hooks';
import type { TFunction } from 'react-i18next';

import { IUpdaterMetaData, IUpdaterStatus } from './interface';

export function useUpdaterObservable(): IUpdaterMetaData | undefined {
  const [updaterMetaData, updaterMetaDataSetter] = useState<IUpdaterMetaData | undefined>();
  useObservable(window.observables.updater.updaterMetaData$, updaterMetaDataSetter as any);
  return updaterMetaData;
}

export function getUpdaterMessage(status: IUpdaterMetaData['status'], info: IUpdaterMetaData['info'], t: TFunction<'translation'>): string {
  if (status === IUpdaterStatus.checkingFailed) {
    return `${t('ErrorMessage')} ${info?.errorMessage ?? '-'}`;
  }
  if (status === IUpdaterStatus.updateAvailable) {
    return `v${info?.version ?? '-'}`;
  }
  return '';
}
