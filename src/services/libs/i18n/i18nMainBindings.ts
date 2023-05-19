import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import fs from 'fs-extra';
import path from 'path';

import { I18NChannels } from '@/constants/channels';
import { LOCALIZATION_FOLDER } from '@/constants/paths';
import { container } from '@services/container';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWindowService } from '@services/windows/interface';
import { type IReadFileRequest, type IWriteFileRequest } from './types';

/**
 * This is the code that will go into the main.js file
 * in order to set up the ipc main bindings
 */
export function mainBindings(): void {
  ipcMain.handle(I18NChannels.readFileRequest, (_event: IpcMainInvokeEvent, readFileArguments: IReadFileRequest) => {
    const localeFilePath = path.join(LOCALIZATION_FOLDER, readFileArguments.filename);
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    fs.readFile(localeFilePath, 'utf8', (error, data) => {
      void windowService.sendToAllWindows(I18NChannels.readFileResponse, {
        key: readFileArguments.key,
        error,
        data: data !== undefined && data !== null ? data.toString() : '',
      });
    });
  });

  ipcMain.handle(I18NChannels.writeFileRequest, async (_event: IpcMainInvokeEvent, writeFileArguments: IWriteFileRequest) => {
    const localeFilePath = path.join(LOCALIZATION_FOLDER, writeFileArguments.filename);
    const localeFileFolderPath = path.dirname(localeFilePath);
    const windowService = container.get<IWindowService>(serviceIdentifier.Window);
    try {
      await fs.ensureDir(localeFileFolderPath);
      try {
        await fs.writeFile(localeFilePath, JSON.stringify(writeFileArguments.data));
      } catch (error) {
        await windowService.sendToAllWindows(I18NChannels.writeFileResponse, {
          keys: writeFileArguments.keys,
          error,
        });
      }
    } catch (directoryCreationError) {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (directoryCreationError) {
        console.error(directoryCreationError);
      }
    }
  });
}

/**
 *  Clears the bindings from ipcMain;
 *  in case app is closed/reopened (only on macos)
 */
export function clearMainBindings(): void {
  ipcMain.removeAllListeners(I18NChannels.readFileRequest);
  ipcMain.removeAllListeners(I18NChannels.writeFileRequest);
}
