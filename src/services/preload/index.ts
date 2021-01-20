import { contextBridge, ipcRenderer } from 'electron';

import './common/i18n';
import './common/require-nodejs';
import './common/simple-context-menu';
import './common/authing-postmessage';
import './common/services';
import { MetaDataChannel } from '@/constants/channels';
import { WindowNames } from '@services/windows/WindowProperties';

const extraMetaJSONString = process.argv.pop() as string;
const extraMeta = JSON.parse(extraMetaJSONString) as Record<string, string>;
const windowName = process.argv.pop() as WindowNames;

const browserViewMetaData = { windowName, ...extraMeta };
contextBridge.exposeInMainWorld('meta', browserViewMetaData);
ipcRenderer.on(MetaDataChannel.getViewMetaData, (event) => {
  event.returnValue = browserViewMetaData;
});
declare global {
  interface Window {
    meta: {
      windowName: WindowNames;
    };
  }
}

if (windowName === WindowNames.view) {
  void import('./view');
}
