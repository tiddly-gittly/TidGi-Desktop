import path from 'path';
import { ipcMain, dialog } from 'electron';
import { injectable, inject } from 'inversify';

import serviceIdentifiers from '@services/serviceIdentifier';
import { Wiki } from '@services/wiki';
import { Git } from '@services/git';
import { Workspace } from '@services/workspaces';
import { WorkspaceView } from '@services/workspacesView';
import { Window } from '@services/windows';
import { WindowNames } from '@services/windows/WindowProperties';
import { Authentication } from '@services/auth';

import { logger } from '@services/libs/log';
import i18n from '@services/libs/i18n';

/**
 * Deal with operations that needs to create a wiki and a git repo at once in a workspace
 */
@injectable()
export class WikiGit {
  constructor(
    @inject(serviceIdentifiers.Wiki) private readonly wikiService: Wiki,
    @inject(serviceIdentifiers.Git) private readonly gitService: Git,
    @inject(serviceIdentifiers.Workspace) private readonly workspaceService: Workspace,
    @inject(serviceIdentifiers.Window) private readonly windowService: Window,
    @inject(serviceIdentifiers.WorkspaceView) private readonly workspaceViewService: WorkspaceView,
    @inject(serviceIdentifiers.Authentication) private readonly authService: Authentication,
  ) {
    this.init();
  }

  private init(): void {
    ipcMain.handle('request-init-wiki-git', async (_event, wikiFolderPath, githubRepoUrl, userInfo, isMainWiki) => {
      try {
        await this.gitService.initWikiGit(wikiFolderPath, githubRepoUrl, userInfo, isMainWiki);
        return '';
      } catch (error) {
        console.info(error);
        await this.wikiService.removeWiki(wikiFolderPath);
        return String(error);
      }
    });

    ipcMain.handle(
      'request-remove-workspace',
      async (_event, id: string): Promise<void> => {
        const mainWindow = this.windowService.get(WindowNames.main);
        if (mainWindow !== undefined) {
          const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: [i18n.t('WorkspaceSelector.RemoveWorkspace'), i18n.t('WorkspaceSelector.RemoveWorkspaceAndDelete'), i18n.t('Cancel')],
            message: i18n.t('WorkspaceSelector.AreYouSure'),
            cancelId: 2,
          });
          try {
            if (response === 0 || response === 1) {
              const workspace = this.workspaceService.get(id);
              if (workspace === undefined) {
                throw new Error(`Need to get workspace with id ${id} but failed`);
              }
              await this.wikiService.stopWatchWiki(workspace.name).catch((error) => logger.error((error as Error).message, error));
              await this.wikiService.stopWiki(workspace.name).catch((error: any) => logger.error((error as Error).message, error));
              await this.wikiService.removeWiki(workspace.name, workspace.isSubWiki ? workspace.mainWikiToLink : undefined, response === 0);
              await this.workspaceViewService.removeWorkspaceView(id);
              // TODO: createMenu();
              // createMenu();
              // restart the main wiki to load content from private wiki
              const mainWikiPath = workspace.mainWikiToLink;
              const mainWorkspace = this.workspaceService.getByName(mainWikiPath);
              if (mainWorkspace === undefined) {
                throw new Error(`Need to get mainWorkspace with name ${mainWikiPath} but failed`);
              }
              const userName = this.authService.get('userName') ?? '';
              await this.wikiService.stopWiki(mainWikiPath);
              await this.wikiService.startWiki(mainWikiPath, mainWorkspace.port, userName);
              // remove folderName from fileSystemPaths
              if (workspace.isSubWiki) {
                this.wikiService.updateSubWikiPluginContent(mainWikiPath, undefined, {
                  ...workspace,
                  subWikiFolderName: path.basename(workspace.name),
                });
              }
            }
          } catch (error) {
            logger.error((error as Error).message, error);
          }
        }
      },
    );
  }
}
