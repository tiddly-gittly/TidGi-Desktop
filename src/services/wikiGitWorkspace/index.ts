import path from 'path';
import { dialog } from 'electron';
import { injectable } from 'inversify';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IGitService, IGitUserInfos } from '@services/git/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IAuthenticationService } from '@services/auth/interface';
import { lazyInject } from '@services/container';

import { logger } from '@services/libs/log';
import i18n from '@services/libs/i18n';
import { IWikiGitWorkspaceService } from './interface';
import { IMenuService } from '@services/menu/interface';

@injectable()
export class WikiGitWorkspace implements IWikiGitWorkspaceService {
  @lazyInject(serviceIdentifier.Wiki) private readonly wikiService!: IWikiService;
  @lazyInject(serviceIdentifier.Git) private readonly gitService!: IGitService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.WorkspaceView) private readonly workspaceViewService!: IWorkspaceViewService;
  @lazyInject(serviceIdentifier.Authentication) private readonly authService!: IAuthenticationService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;

  public initWikiGitTransaction = async (
    wikiFolderPath: string,
    isMainWiki: boolean,
    isSyncedWiki: boolean,
    githubRepoUrlOrMainWikiToUnLinkOverload?: string,
    userInfo?: IGitUserInfos,
    mainWikiToUnLink?: string,
  ): Promise<void> => {
    try {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (isSyncedWiki) {
        const githubRepoUrl = githubRepoUrlOrMainWikiToUnLinkOverload;
        if (githubRepoUrl !== undefined && userInfo !== undefined) {
          await this.gitService.initWikiGit(wikiFolderPath, isMainWiki, isSyncedWiki, githubRepoUrl, userInfo);
        } else {
          throw new Error(`githubRepoUrl is ${githubRepoUrl ?? 'undefined'} , userInfo is ${userInfo === undefined ? JSON.stringify(userInfo) : 'undefined'}`);
        }
      } else {
        await this.gitService.initWikiGit(wikiFolderPath, isMainWiki, false);
      }
    } catch (error) {
      logger.info(error);
      if (isMainWiki) {
        await this.wikiService.removeWiki(wikiFolderPath);
      } else {
        await this.wikiService.removeWiki(wikiFolderPath, isSyncedWiki ? mainWikiToUnLink : githubRepoUrlOrMainWikiToUnLinkOverload);
      }
      throw new Error(error);
    }
  };

  public removeWorkspace = async (id: string): Promise<void> => {
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
          const workspace = await this.workspaceService.get(id);
          if (workspace === undefined) {
            throw new Error(`Need to get workspace with id ${id} but failed`);
          }
          await this.wikiService.stopWatchWiki(workspace.name).catch((error: Error) => logger.error(error.message, error));
          await this.wikiService.stopWiki(workspace.name).catch((error: Error) => logger.error(error.message, error));
          await this.wikiService.removeWiki(workspace.name, workspace.isSubWiki ? workspace.mainWikiToLink : undefined, response === 0);
          await this.workspaceViewService.removeWorkspaceView(id);
          await this.menuService.buildMenu();
          // restart the main wiki to load content from private wiki
          const mainWikiPath = workspace.mainWikiToLink;
          const mainWorkspace = await this.workspaceService.getByName(mainWikiPath);
          if (mainWorkspace === undefined) {
            throw new Error(`Need to get mainWorkspace with name ${mainWikiPath} but failed`);
          }
          const userName = (await this.authService.get('userName')) ?? '';
          await this.wikiService.stopWiki(mainWikiPath);
          await this.wikiService.startWiki(mainWikiPath, mainWorkspace.port, userName);
          // remove folderName from fileSystemPaths
          if (workspace.isSubWiki) {
            await this.wikiService.updateSubWikiPluginContent(mainWikiPath, undefined, {
              ...workspace,
              subWikiFolderName: path.basename(workspace.name),
            });
          }
        }
      } catch (error) {
        logger.error((error as Error).message, error);
      }
    }
  };
}
