import { contextBridge, ipcRenderer } from 'electron';
import { MetaDataChannel } from '@/constants/channels';
import { WindowNames, WindowMeta } from '@services/windows/WindowProperties';

const metaDataArguments = process.argv
  .filter((item) => item.startsWith(MetaDataChannel.browserViewMetaData))
  .map((item) => item.replace(MetaDataChannel.browserViewMetaData, ''));
export const windowName = metaDataArguments[0] as WindowNames;
const extraMetaJSONString = metaDataArguments[1] ?? '{}';
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
