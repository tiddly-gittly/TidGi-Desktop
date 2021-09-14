/* eslint-disable @typescript-eslint/require-await */
import { app, dialog, shell, MessageBoxOptions } from 'electron';
import { injectable, inject } from 'inversify';
import { spawn, Thread, Worker, ModuleThread } from 'threads';

import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { INativeService } from './interface';
import serviceIdentifier from '@services/serviceIdentifier';

// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=zxWorker!./zxWorker.ts';
import { ZxWorker } from './zxWorker';

@injectable()
export class NativeService implements INativeService {
  constructor(@inject(serviceIdentifier.Window) private readonly windowService: IWindowService) {}

  public async executeZxScript(zxWorkerArguments: { fileContent: string; fileName: string }): Promise<string> {
    const worker = await spawn<ZxWorker>(new Worker(workerURL));
    return await worker.executeZxScript(zxWorkerArguments);
  }

  public async showElectronMessageBox(message: string, type: MessageBoxOptions['type'] = 'info', windowName = WindowNames.main): Promise<void> {
    const window = this.windowService.get(windowName);
    if (window !== undefined) {
      await dialog.showMessageBox(window, { message, type });
    }
  }

  public async pickDirectory(defaultPath?: string): Promise<string[]> {
    const dialogResult = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath,
    });
    if (!dialogResult.canceled && dialogResult.filePaths.length > 0) {
      return dialogResult.filePaths;
    }
    if (dialogResult.canceled && defaultPath !== undefined) {
      return [defaultPath];
    }
    return [];
  }

  public async pickFile(filters?: Electron.OpenDialogOptions['filters']): Promise<string[]> {
    const dialogResult = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters,
    });
    if (!dialogResult.canceled && dialogResult.filePaths.length > 0) {
      return dialogResult.filePaths;
    }
    return [];
  }

  public async open(uri: string, isDirectory = false): Promise<void> {
    return isDirectory ? shell.showItemInFolder(uri) : await shell.openExternal(uri);
  }

  public async quit(): Promise<void> {
    app.quit();
  }
}
