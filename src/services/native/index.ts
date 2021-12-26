/* eslint-disable @typescript-eslint/require-await */
import { app, dialog, shell, MessageBoxOptions } from 'electron';
import { injectable, inject } from 'inversify';
import { Observable } from 'rxjs';

import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { INativeService } from './interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService, ZxWorkerControlActions } from '@services/wiki/interface';
import { IWorkspaceService } from '@services/workspaces/interface';
import { ZX_FOLDER } from '@/constants/paths';
import { logger } from '@services/libs/log';
import { findEditorOrDefault, findGitGUIAppOrDefault, launchExternalEditor } from './externalApp';
import { reportErrorToGithubWithTemplates } from './reportError';
import { IZxFileInput } from '@services/wiki/wikiWorker';
import { ZxNotInitializedError } from './error';
import { lazyInject } from '@services/container';

@injectable()
export class NativeService implements INativeService {
  @lazyInject(serviceIdentifier.Wiki) private readonly wikiService!: IWikiService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;

  constructor(@inject(serviceIdentifier.Window) private readonly windowService: IWindowService) {}

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

  public executeZxScript$(zxWorkerArguments: IZxFileInput, wikiFolderLocation?: string): Observable<string> {
    const zxWorker = this.wikiService.getWorker(wikiFolderLocation ?? this.workspaceService.getActiveWorkspaceSync()?.wikiFolderLocation ?? '');
    if (zxWorker === undefined) {
      const error = new ZxNotInitializedError();
      return new Observable<string>((observer) => {
        logger.error(error.message, zxWorkerArguments);
        observer.next(`${error.message}\n`);
      });
    }
    logger.info('zxWorker execute', { zxWorkerArguments, ZX_FOLDER });
    const observable = zxWorker.executeZxScript(zxWorkerArguments, ZX_FOLDER);
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

  public async openNewGitHubIssue(error: Error): Promise<void> {
    reportErrorToGithubWithTemplates(error);
  }
}
