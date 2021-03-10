import { ipcMain } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { IWindowService } from '@services/windows/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { container } from '@services/container';
import { LOCALIZATION_FOLDER } from '@services/constants/paths';
import { I18NChannels } from '@/constants/channels';
import { IReadFileRequest, IWriteFileRequest } from './types';

/**
 * This is the code that will go into the main.js file
 * in order to set up the ipc main bindings
 */
export function mainBindings(): void {
  ipcMain.handle(I18NChannels.readFileRequest, (_event: IpcMainInvokeEvent, readFileArgs: IReadFileRequest) => {
    const localeFilePath = path.join(LOCALIZATION_FOLDER, readFileArgs.filename);
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
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
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
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
}

/**
 *  Clears the bindings from ipcMain;
 *  in case app is closed/reopened (only on macos)
 */
export function clearMainBindings(ipcMain: IpcMain): void {
  ipcMain.removeAllListeners(I18NChannels.readFileRequest);
  ipcMain.removeAllListeners(I18NChannels.writeFileRequest);
}
