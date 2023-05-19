import { WikiChannel } from '@/constants/channels';
import { contextBridge, ipcRenderer } from 'electron';

export const logMethods = {
  /**
   * Register to update from `WikiChannel.createProgress`, which is send from `src/services/libs/log/rendererTransport.ts`
   * @param messageSetter can be wikiCreationMessageSetter from a useEffect
   * @returns
   */
  registerWikiCreationMessage: (messageSetter: (message: string) => void): () => void => {
    const handleNextMessage = (_event: Electron.IpcRendererEvent, message: string): void => {
      messageSetter(message);
    };
    ipcRenderer.on(WikiChannel.createProgress, handleNextMessage);
    return () => ipcRenderer.removeListener(WikiChannel.createProgress, handleNextMessage);
  },
};
contextBridge.exposeInMainWorld('log', logMethods);

declare global {
  interface Window {
    log: typeof logMethods;
  }
}
