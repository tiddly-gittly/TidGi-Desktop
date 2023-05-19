/* eslint-disable @typescript-eslint/require-await */
import { app, dialog, MessageBoxOptions, shell } from 'electron';
import { inject, injectable } from 'inversify';
import path from 'path';
import { Observable } from 'rxjs';

import { ZX_FOLDER } from '@/constants/paths';
import { lazyInject } from '@services/container';
import { ILogLevels, logger } from '@services/libs/log';
import { getLocalHostUrlWithActualIP } from '@services/libs/url';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService, ZxWorkerControlActions } from '@services/wiki/interface';
import { IZxFileInput } from '@services/wiki/wikiWorker';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { IWorkspaceService } from '@services/workspaces/interface';
import i18next from 'i18next';
import { ZxNotInitializedError } from './error';
import { findEditorOrDefault, findGitGUIAppOrDefault, launchExternalEditor } from './externalApp';
import { INativeService } from './interface';
import { reportErrorToGithubWithTemplates } from './reportError';

@injectable()
export class NativeService implements INativeService {
  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  constructor(@inject(serviceIdentifier.Window) private readonly windowService: IWindowService) {}

  public async openInEditor(filePath: string, editorName?: string): Promise<boolean> {
    // TODO: open vscode by default to speed up, support choose favorite editor later
    let defaultEditor = await findEditorOrDefault('Visual Studio Code').catch(() => {});
    if (defaultEditor === undefined) {
      defaultEditor = await findEditorOrDefault(editorName);
    }
    if (defaultEditor !== undefined) {
      await launchExternalEditor(filePath, defaultEditor);
      return true;
    }
    return false;
  }

  public async openInGitGuiApp(filePath: string, editorName?: string): Promise<boolean> {
    const defaultEditor = await findGitGUIAppOrDefault(editorName);
    if (defaultEditor !== undefined) {
      await launchExternalEditor(filePath, defaultEditor);
      return true;
    }
    return false;
  }

  public async openPath(filePath: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!filePath.trim()) {
      return;
    }
    logger.debug(`NativeService.openPath() Opening ${filePath}`);
    // TODO: add a switch that tell user these are dangerous features, use at own risk.
    if (path.isAbsolute(filePath)) {
      await shell.openPath(filePath);
    } else {
      const activeWorkspace = this.workspaceService.getActiveWorkspaceSync();
      if (activeWorkspace?.wikiFolderLocation !== undefined) {
        const absolutePath = path.resolve(path.join(activeWorkspace.wikiFolderLocation, filePath));
        await shell.openPath(absolutePath);
      }
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
        switch (message.type) {
          case 'control': {
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

            break;
          }
          case 'stderr':
          case 'stdout': {
            observer.next(message.message);

            break;
          }
          case 'execution': {
            observer.next(`${i18next.t('Scripting.ExecutingScript')}

\`\`\`js
${message.message}
\`\`\`

`);

            break;
          }
            // No default
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
    isDirectory ? shell.showItemInFolder(uri) : await shell.openExternal(uri);
  }

  public async quit(): Promise<void> {
    app.quit();
  }

  public async log(level: ILogLevels, message: string, meta?: Record<string, unknown>): Promise<void> {
    logger.log(level, message, meta);
  }

  public async openNewGitHubIssue(error: Error): Promise<void> {
    reportErrorToGithubWithTemplates(error);
  }

  public async getLocalHostUrlWithActualIP(url: string): Promise<string> {
    return await getLocalHostUrlWithActualIP(url);
  }

  public async path(method: 'basename' | 'dirname' | 'join', pathString: string | undefined, ...paths: string[]): Promise<string | undefined> {
    switch (method) {
      case 'basename': {
        if (typeof pathString === 'string') return path.basename(pathString);
        break;
      }
      case 'dirname': {
        if (typeof pathString === 'string') return path.dirname(pathString);
        break;
      }
      case 'join': {
        if (typeof pathString === 'string') return path.join(pathString, ...paths);
        break;
      }
      default: {
        break;
      }
    }
  }
}
