import 'reflect-metadata';
import { contextBridge, ipcRenderer } from 'electron';

import './common/i18n';
import './common/require-nodejs';
import './common/simple-context-menu';
import './common/authing-postmessage';
import * as service from './common/services';
import { MetaDataChannel } from '@/constants/channels';
import { WindowNames, WindowMeta, IPossibleWindowMeta } from '@services/windows/WindowProperties';

const extraMetaJSONString = process.argv.pop() as string;
const windowName = process.argv.pop() as WindowNames;
const extraMeta = JSON.parse(extraMetaJSONString) as WindowMeta[WindowNames];

const browserViewMetaData = { windowName, ...extraMeta };
contextBridge.exposeInMainWorld('meta', browserViewMetaData);
ipcRenderer.on(MetaDataChannel.getViewMetaData, (event) => {
  event.returnValue = browserViewMetaData;
});

contextBridge.exposeInMainWorld('service', service);

declare global {
  interface Window {
    service: typeof service;
    meta: IPossibleWindowMeta;
  }
}

if (windowName === WindowNames.view) {
  void import('./view');
}
