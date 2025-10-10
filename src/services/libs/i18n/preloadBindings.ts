import { I18NChannels } from '@/constants/channels';
import { IpcRenderer, IpcRendererEvent } from 'electron';
import type { IReadWriteFileRequest } from './types';

/** This is the code that will go into the preload.js file
 *  in order to set up the contextBridge api
 */
export const preloadBindings = function(ipcRenderer: IpcRenderer): {
  onLanguageChange: (callback: (language: { lng: string }) => unknown) => void;
  onReceive: (channel: I18NChannels, callback: (readWriteFileArguments: IReadWriteFileRequest) => void) => void;
  send: (channel: I18NChannels, readWriteFileArguments: IReadWriteFileRequest) => Promise<void>;
} {
  return {
    send: async (channel: I18NChannels, readWriteFileArguments: IReadWriteFileRequest): Promise<void> => {
      const validChannels = [I18NChannels.readFileRequest, I18NChannels.writeFileRequest];
      if (validChannels.includes(channel)) {
        await ipcRenderer.invoke(channel, readWriteFileArguments);
      }
    },
    onReceive: (channel: I18NChannels, callback: (readWriteFileArguments: IReadWriteFileRequest) => void) => {
      const validChannels = [I18NChannels.readFileResponse, I18NChannels.writeFileResponse];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes "sender"
        ipcRenderer.on(channel, (_event: IpcRendererEvent, arguments_: IReadWriteFileRequest) => {
          callback(arguments_);
        });
      }
    },
    onLanguageChange: (callback: (language: { lng: string }) => unknown) => {
      // Deliberately strip event as it includes "sender"
      ipcRenderer.on(I18NChannels.changeLanguageRequest, (_event: IpcRendererEvent, language: { lng: string }) => {
        callback(language);
      });
    },
  };
};
