import { MetaDataChannel } from '@/constants/channels';
import { IPossibleWindowMeta, WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { contextBridge, ipcRenderer } from 'electron';

const metaDataArguments = process.argv
  .filter((item) => item.startsWith(MetaDataChannel.browserViewMetaData))
  .map((item) => item.replace(MetaDataChannel.browserViewMetaData, ''));
export const windowName = (metaDataArguments[0] as WindowNames | undefined) ?? WindowNames.main;
const extraMetaJSONString = decodeURIComponent(metaDataArguments[1] ?? '{}');
let extraMeta: WindowMeta[WindowNames] = {};
try {
  extraMeta = JSON.parse(extraMetaJSONString) as WindowMeta[WindowNames];
} catch (error) {
  console.error(
    `Failed to parse extraMeta. ${(error as Error).message} extraMeta is ${extraMetaJSONString} and process.argv is ${JSON.stringify(process.argv)}`,
  );
}

export let browserViewMetaData = { windowName, ...extraMeta };
contextBridge.exposeInMainWorld('meta', () => browserViewMetaData);
ipcRenderer.on(MetaDataChannel.getViewMetaData, (_event, payload?: { ipcToken: string }) => {
  ipcRenderer.send(`${MetaDataChannel.getViewMetaData}-${payload?.ipcToken ?? ''}`, browserViewMetaData);
});
/**
 * Receive update or windowMeta from server service.
 */
ipcRenderer.on(MetaDataChannel.pushViewMetaData, (_event, payload?: IPossibleWindowMeta) => {
  browserViewMetaData = { ...browserViewMetaData, ...payload };
});
