/* eslint-disable unicorn/prevent-abbreviations */
import { IpcRenderer, IpcRendererEvent } from 'electron';
import { I18NChannels } from '@/constants/channels';
import { IReadWriteFileRequest } from './types';

/** This is the code that will go into the preload.js file
 *  in order to set up the contextBridge api
 */
export const preloadBindings = function (
  ipcRenderer: IpcRenderer,
): {
  send: (channel: I18NChannels, readWriteFileArgs: IReadWriteFileRequest) => Promise<void>;
  onReceive: (channel: I18NChannels, callback: (readWriteFileArgs: IReadWriteFileRequest) => void) => void;
  onLanguageChange: (callback: (language: string) => unknown) => void;
} {
  return {
    send: async (channel: I18NChannels, readWriteFileArgs: IReadWriteFileRequest): Promise<void> => {
      const validChannels = [I18NChannels.readFileRequest, I18NChannels.writeFileRequest];
      if (validChannels.includes(channel)) {
        await ipcRenderer.invoke(channel, readWriteFileArgs);
      }
    },
    onReceive: (channel: I18NChannels, callback: (readWriteFileArgs: IReadWriteFileRequest) => void) => {
      const validChannels = [I18NChannels.readFileResponse, I18NChannels.writeFileResponse];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes "sender"
        ipcRenderer.on(channel, (_event: IpcRendererEvent, arguments_: IReadWriteFileRequest) => callback(arguments_));
      }
    },
    onLanguageChange: (callback: (language: string) => unknown) => {
      // Deliberately strip event as it includes "sender"
      ipcRenderer.on(I18NChannels.changeLanguageRequest, (_event: IpcRendererEvent, language: string) => {
        callback(language);
      });
    },
  };
};
