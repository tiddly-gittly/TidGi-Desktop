/* eslint-disable @typescript-eslint/require-await */
import { app, dialog, shell, MessageBoxOptions } from 'electron';
import { injectable, inject } from 'inversify';
import { ModuleThread, spawn, Worker } from 'threads';
import { Observable, of } from 'rxjs';

import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { INativeService, ZxWorkerControlActions } from './interface';
import serviceIdentifier from '@services/serviceIdentifier';

// @ts-expect-error it don't want .ts
// eslint-disable-next-line import/no-webpack-loader-syntax
import workerURL from 'threads-plugin/dist/loader?name=zxWorker!./zxWorker.ts';
import type { ZxWorker } from './zxWorker';

@injectable()
export class NativeService implements INativeService {
  zxWorker: ModuleThread<ZxWorker> | undefined;
  constructor(@inject(serviceIdentifier.Window) private readonly windowService: IWindowService) {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const worker = await spawn<ZxWorker>(new Worker(workerURL));
    this.zxWorker = worker;
  }

  public executeZxScript(zxWorkerArguments: { fileContent: string; fileName: string }): Observable<string> {
    if (this.zxWorker === undefined) {
      return of('this.zxWorker not initialized');
    }
    const observable = this.zxWorker.executeZxScript(zxWorkerArguments);
    return new Observable((observer) => {
      observable.subscribe((message) => {
        if (message.type === 'control') {
          switch (message.actions) {
            case ZxWorkerControlActions.start: {
              if (message.message !== undefined) {
                observer.next(message.message);
              }
              break;
            }
            case ZxWorkerControlActions.error: {
              const errorMessage = message.message ?? 'get ZxWorkerControlActions.error without message';
              console.error(errorMessage, { message });
              observer.next(errorMessage);
              break;
            }
            case ZxWorkerControlActions.ended: {
              const endedMessage = message.message ?? 'get ZxWorkerControlActions.ended without message';
              observer.next(endedMessage);
              break;
            }
          }
        } else if (message.type === 'stderr' || message.type === 'stdout') {
          observer.next(message.message);
        }
      });
    });
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
