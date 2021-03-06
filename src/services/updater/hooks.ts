import { useState } from 'react';
import { useObservable } from 'beautiful-react-hooks';

import formatBytes from '@services/libs/format-bytes';
import { IUpdaterMetaData } from './interface';

export function useUpdaterObservable(): IUpdaterMetaData | undefined {
  const [updaterMetaData, updaterMetaDataSetter] = useState<IUpdaterMetaData | undefined>();
  useObservable<IUpdaterMetaData | undefined>(window.service.updater.updaterMetaData$, updaterMetaDataSetter);
  return updaterMetaData;
}

export function getUpdaterDesc(status: IUpdaterMetaData['status'], info: IUpdaterMetaData['info']): string {
  if (info instanceof Error) {
    return info.message;
  }
  if (status === 'download-progress') {
    if (info !== undefined && 'transferred' in info) {
      const { transferred, total, bytesPerSecond } = info;
      return `Downloading updates (${formatBytes(transferred)}/${formatBytes(total)} at ${formatBytes(bytesPerSecond)}/s)...`;
    }
    return 'Downloading updates...';
  }
  if (status === 'checking-for-update') {
    return 'Checking for updates...';
  }
  if (status === 'update-available') {
    return 'Downloading updates...';
  }
  if (status === 'update-downloaded') {
    if (info !== undefined && 'version' in info) return `A new version (${info.version}) has been downloaded.`;
    return 'A new version has been downloaded.';
  }
  return '';
}
