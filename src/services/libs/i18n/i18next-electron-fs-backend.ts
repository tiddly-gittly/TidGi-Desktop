/* eslint-disable unicorn/prevent-abbreviations */
import fs from 'fs-extra';
import path from 'path';
import { IpcRenderer, IpcMain, BrowserWindow, IpcMainInvokeEvent, IpcRendererEvent, MenuItemConstructorOptions } from 'electron';

import { Window } from '@services/windows';
import { Preference } from '@services/preferences';
import { View } from '@services/view';
import { MenuService } from '@services/menu';
import { container } from '@services/container';
import { LOCALIZATION_FOLDER } from '@services/constants/paths';
import { I18NChannels } from '@/constants/channels';
import i18n from '.';

export interface IReadFileRequest {
  filename: string;
  key: string;
}
export interface IWriteFileRequest {
  filename: string;
  data: string;
  keys: string[];
}
export interface IReadWriteFileRequest extends IReadFileRequest, IWriteFileRequest {}

/** This is the code that will go into the preload.js file
 *  in order to set up the contextBridge api
 */
export const preloadBindings = function (
  ipcRenderer: IpcRenderer,
): {
  send: (channel: I18NChannels, readWriteFileArgs: IReadWriteFileRequest) => Promise<void>;
  onReceive: (channel: I18NChannels, callback: (readWriteFileArgs: IReadWriteFileRequest) => void) => void;
  onLanguageChange: (callback: (language: string) => void) => void;
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
    onLanguageChange: (callback: (language: string) => void) => {
      // Deliberately strip event as it includes "sender"
      ipcRenderer.on(I18NChannels.changeLanguageRequest, (_event: IpcRendererEvent, language: string) => {
        callback(language);
      });
    },
  };
};

/**
 * This is the code that will go into the main.js file
 * in order to set up the ipc main bindings
 */
export const mainBindings = function (ipcMain: IpcMain, browserWindow: BrowserWindow): void {
  ipcMain.handle(I18NChannels.readFileRequest, (_event: IpcMainInvokeEvent, readFileArgs: IReadFileRequest) => {
    const localeFilePath = path.join(LOCALIZATION_FOLDER, readFileArgs.filename);
    const windowService = container.resolve(Window);
    fs.readFile(localeFilePath, 'utf8', (error, data) => {
      windowService.sendToAllWindows(I18NChannels.readFileResponse, {
        key: readFileArgs.key,
        error,
        data: typeof data !== 'undefined' && data !== null ? data.toString() : '',
      });
    });
  });

  ipcMain.handle(I18NChannels.writeFileRequest, (_event: IpcMainInvokeEvent, writeFileArgs: IWriteFileRequest) => {
    const localeFilePath = path.join(LOCALIZATION_FOLDER, writeFileArgs.filename);
    const localeFileFolderPath = path.dirname(localeFilePath);
    const windowService = container.resolve(Window);
    fs.ensureDir(localeFileFolderPath, (directoryCreationError?: Error) => {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (directoryCreationError) {
        console.error(directoryCreationError);
        return;
      }
      fs.writeFile(localeFilePath, JSON.stringify(writeFileArgs.data), (error: Error) => {
        windowService.sendToAllWindows(I18NChannels.writeFileResponse, {
          keys: writeFileArgs.keys,
          error,
        });
      });
    });
  });
};

/**
 *  Clears the bindings from ipcMain;
 *  in case app is closed/reopened (only on macos)
 */
export const clearMainBindings = function (ipcMain: IpcMain): void {
  ipcMain.removeAllListeners(I18NChannels.readFileRequest);
  ipcMain.removeAllListeners(I18NChannels.writeFileRequest);
};

const whitelistMap = JSON.parse(fs.readFileSync(path.join(LOCALIZATION_FOLDER, 'whitelist.json'), 'utf-8')) as Record<string, string>;

const whiteListedLanguages = Object.keys(whitelistMap);

/**
 * Register languages into language menu, call this function after container init
 */
export function buildLanguageMenu(): void {
  const preferenceService = container.resolve(Preference);
  const windowService = container.resolve(Window);
  const viewService = container.resolve(View);
  const menuService = container.resolve(MenuService);
  const subMenu: MenuItemConstructorOptions[] = [];
  for (const language of whiteListedLanguages) {
    subMenu.push({
      label: whitelistMap[language],
      click: async () => {
        await Promise.all([preferenceService.set('language', language), i18n.changeLanguage(language)]);
        viewService.forEachView((view) => {
          view.webContents.send(I18NChannels.changeLanguageRequest, {
            lng: language,
          });
        });
        windowService.sendToAllWindows(I18NChannels.changeLanguageRequest, {
          lng: language,
        });
      },
    });
  }

  menuService.insertMenu('Language', subMenu);
}
