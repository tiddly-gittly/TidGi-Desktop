import path from 'path';
import { dialog } from 'electron';
import { injectable } from 'inversify';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki/interface';
import type { IGitService, IGitUserInfos } from '@services/git/interface';
import type { INewWorkspaceConfig, IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';
import type { IWindowService } from '@services/windows/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IAuthenticationService } from '@services/auth/interface';
import { lazyInject } from '@services/container';

import { logger } from '@services/libs/log';
import i18n from '@services/libs/i18n';
import { IWikiGitWorkspaceService } from './interface';
import { IMenuService } from '@services/menu/interface';
import { InitWikiGitError, InitWikiGitRevertError } from './error';
import { SupportedStorageServices } from '@services/types';

@injectable()
export class WikiGitWorkspace implements IWikiGitWorkspaceService {
  @lazyInject(serviceIdentifier.Wiki) private readonly wikiService!: IWikiService;
  @lazyInject(serviceIdentifier.Git) private readonly gitService!: IGitService;
  @lazyInject(serviceIdentifier.Workspace) private readonly workspaceService!: IWorkspaceService;
  @lazyInject(serviceIdentifier.Window) private readonly windowService!: IWindowService;
  @lazyInject(serviceIdentifier.WorkspaceView) private readonly workspaceViewService!: IWorkspaceViewService;
  @lazyInject(serviceIdentifier.Authentication) private readonly authService!: IAuthenticationService;
  @lazyInject(serviceIdentifier.MenuService) private readonly menuService!: IMenuService;

  public initWikiGitTransaction = async (newWorkspaceConfig: INewWorkspaceConfig, userInfo?: IGitUserInfos): Promise<void> => {
    const newWorkspace = await this.workspaceViewService.createWorkspaceView(newWorkspaceConfig);
    const { gitUrl, storageService, wikiFolderLocation, isSubWiki, id: workspaceID, mainWikiToLink } = newWorkspace;
    const isSyncedWiki = storageService !== SupportedStorageServices.local;
    try {
      if (isSyncedWiki) {
        if (typeof gitUrl === 'string' && userInfo !== undefined) {
          await this.gitService.initWikiGit(wikiFolderLocation, !isSubWiki, isSyncedWiki, gitUrl, userInfo);
        } else {
          throw new Error(
            `E-1-1 SyncedWiki gitUrl is ${gitUrl ?? 'undefined'} , userInfo is ${userInfo === undefined ? JSON.stringify(userInfo) : 'undefined'}`,
          );
        }
      } else {
        await this.gitService.initWikiGit(wikiFolderLocation, !isSubWiki, false);
      }
    } catch (error) {
      const errorMessage = `initWikiGitTransaction failed, ${(error as Error).message} ${(error as Error).stack ?? ''}`;
      logger.crit(errorMessage);
      await this.workspaceService.remove(workspaceID);
      try {
        if (!isSubWiki) {
          await this.wikiService.removeWiki(wikiFolderLocation);
        } else if (typeof mainWikiToLink === 'string') {
          await this.wikiService.removeWiki(wikiFolderLocation, mainWikiToLink);
        }
      } catch (error_) {
        throw new InitWikiGitRevertError((error_ as Error).message);
      }
      throw new InitWikiGitError(errorMessage);
    }
  };

  public removeWorkspace = async (workspaceID: string): Promise<void> => {
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
          const workspace = await this.workspaceService.get(workspaceID);
          if (workspace === undefined) {
            throw new Error(`Need to get workspace with id ${workspaceID} but failed`);
          }
          const { isSubWiki, mainWikiToLink, wikiFolderLocation } = workspace;
          await this.wikiService.stopWatchWiki(wikiFolderLocation).catch((error: Error) => logger.error(error.message, error));
          await this.wikiService.stopWiki(wikiFolderLocation).catch((error: Error) => logger.error(error.message, error));
          if (isSubWiki) {
            if (mainWikiToLink === null) {
              throw new Error(`workspace.mainWikiToLink is null in WikiGitWorkspace.removeWorkspace ${JSON.stringify(workspace)}`);
            }
            await this.wikiService.removeWiki(wikiFolderLocation, mainWikiToLink, response === 0);
            // remove folderName from fileSystemPaths
            await this.wikiService.updateSubWikiPluginContent(mainWikiToLink, undefined, {
              ...workspace,
              subWikiFolderName: path.basename(wikiFolderLocation),
            });
          } else {
            await this.wikiService.removeWiki(wikiFolderLocation);
          }
          await this.workspaceViewService.removeWorkspaceView(workspaceID);
          await this.wikiService.wikiStartup(workspace);
        }
      } catch (error) {
        logger.error((error as Error).message, error);
      }
    }
  };
}
