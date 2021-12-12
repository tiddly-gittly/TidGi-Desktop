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
import type { IZxFileInput, ZxWorker } from './zxWorker';
import { ZX_FOLDER } from '@/constants/paths';
import { logger } from '@services/libs/log';
import { ZxInitializationError, ZxInitializationRetryFailedError, ZxNotInitializedError } from './error';
import { findEditorOrDefault, findGitGUIAppOrDefault, launchExternalEditor } from './externalApp';

@injectable()
export class NativeService implements INativeService {
  zxWorker: ModuleThread<ZxWorker> | undefined;
  startRetryCount = 0;

  constructor(@inject(serviceIdentifier.Window) private readonly windowService: IWindowService) {
    void this.initialize().catch((error) => {
      logger.error((error as Error).message);
    });
  }

  private async initialize(): Promise<void> {
    if (this.startRetryCount >= 3) {
      throw new ZxInitializationRetryFailedError();
    }
    try {
      const worker = await spawn<ZxWorker>(new Worker(workerURL as string));
      this.zxWorker = worker;
      logger.info('zxWorker initialized');
    } catch (error) {
      this.startRetryCount += 1;
      throw new ZxInitializationError(` ${(error as Error).message} ${(error as Error).stack ?? ''}`);
    }
  }

  public async openInEditor(filePath: string, editorName?: string): Promise<void> {
    // TODO: open vscode by default to speed up, support choose favorite editor later
    let defaultEditor = await findEditorOrDefault('Visual Studio Code').catch(() => {});
    if (defaultEditor === undefined) {
      defaultEditor = await findEditorOrDefault(editorName);
    }
    if (defaultEditor !== undefined) {
      await launchExternalEditor(filePath, defaultEditor);
    }
  }

  public async openInGitGuiApp(filePath: string, editorName?: string): Promise<void> {
    const defaultEditor = await findGitGUIAppOrDefault(editorName);
    if (defaultEditor !== undefined) {
      await launchExternalEditor(filePath, defaultEditor);
    }
  }

  public executeZxScript$(zxWorkerArguments: IZxFileInput): Observable<string> {
    if (this.zxWorker === undefined) {
      const error = new ZxNotInitializedError();
      return new Observable<string>((observer) => {
        logger.error(error.message, zxWorkerArguments);
        observer.next(`${error.message}\n`);
        void this.initialize()
          .catch((error_) => {
            logger.error((error_ as Error).message);
            observer.next(`${(error_ as Error).message}\n`);
          })
          .then(() => {
            const retryExecuteZxObservable = this.executeZxScript$(zxWorkerArguments);
            retryExecuteZxObservable.subscribe(observer);
          });
      });
    }
    logger.info('zxWorker execute', { zxWorkerArguments, ZX_FOLDER });
    const observable = this.zxWorker.executeZxScript(zxWorkerArguments, ZX_FOLDER);
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
              logger.error(`zxWorker execute failed with error ${errorMessage}`, { message });
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

  public async log(level: string, message: string, meta?: Record<string, unknown>): Promise<void> {
    logger.log(level, message, meta);
  }
}
