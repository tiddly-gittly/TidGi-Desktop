import { contextBridge, ipcRenderer } from 'electron';
import { MetaDataChannel } from '@/constants/channels';
import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';

const extraMetaJSONString = process.argv.pop() as string;
export const windowName = process.argv.pop() as WindowNames;
export const extraMeta = JSON.parse(extraMetaJSONString) as WindowMeta[WindowNames];

export const browserViewMetaData = { windowName, ...extraMeta };
contextBridge.exposeInMainWorld('meta', browserViewMetaData);
ipcRenderer.on(MetaDataChannel.getViewMetaData, (event) => {
  event.returnValue = browserViewMetaData;
});
