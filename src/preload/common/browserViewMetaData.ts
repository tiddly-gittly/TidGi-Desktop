import { contextBridge, ipcRenderer } from 'electron';
import { MetaDataChannel } from '@/constants/channels';
import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';

const extraMetaJSONString = process.argv.pop() as string;
export const windowName = process.argv.pop() as WindowNames;
export let extraMeta: WindowMeta[WindowNames] = {};
try {
  extraMeta = JSON.parse(extraMetaJSONString) as WindowMeta[WindowNames];
} catch (error) {
  console.error(
    `Failed to parse extraMeta. ${(error as Error).message} extraMeta is ${extraMetaJSONString} and process.argv is ${JSON.stringify(process.argv)}`,
  );
}

export const browserViewMetaData = { windowName, ...extraMeta };
contextBridge.exposeInMainWorld('meta', browserViewMetaData);
ipcRenderer.on(MetaDataChannel.getViewMetaData, (event) => {
  event.returnValue = browserViewMetaData;
});
