import path from 'path';
import { ipcMain, dialog } from 'electron';
import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { injectable, inject } from 'inversify';

import serviceIdentifier from '@services/serviceIdentifier';
import type { IWikiService } from '@services/wiki';
import type { IGitService } from '@services/git';
import type { IWorkspaceService } from '@services/workspaces';
import type { IWorkspaceViewService } from '@services/workspacesView';
import type { IWindowService } from '@services/windows';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IAuthenticationService } from '@services/auth';

import { logger } from '@services/libs/log';
import i18n from '@services/libs/i18n';
import { IUserInfo } from '../types';
import { WikiGitWorkspaceChannel } from '@/constants/channels';

/**
 * Deal with operations that needs to create a wiki and a git repo at once in a workspace
 */
export interface IWikiGitWorkspaceService {
  initWikiGit: (wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo, isMainWiki: boolean) => Promise<string>;
  removeWorkspace: (id: string) => Promise<void>;
}
export const WikiGitWorkspaceServiceIPCDescriptor = {
  channel: WikiGitWorkspaceChannel.name,
  properties: {
    initWikiGit: ProxyPropertyType.Function,
    removeWorkspace: ProxyPropertyType.Function,
  },
};
@injectable()
export class WikiGitWorkspace {
  constructor(
    @inject(serviceIdentifier.Wiki) private readonly wikiService: IWikiService,
    @inject(serviceIdentifier.Git) private readonly gitService: IGitService,
    @inject(serviceIdentifier.Workspace) private readonly workspaceService: IWorkspaceService,
    @inject(serviceIdentifier.Window) private readonly windowService: IWindowService,
    @inject(serviceIdentifier.WorkspaceView) private readonly workspaceViewService: IWorkspaceViewService,
    @inject(serviceIdentifier.Authentication) private readonly authService: IAuthenticationService,
  ) {}

  public initWikiGit = async (wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo, isMainWiki: boolean): Promise<string> => {
    try {
      await this.gitService.initWikiGit(wikiFolderPath, githubRepoUrl, userInfo, isMainWiki);
      return '';
    } catch (error) {
      console.info(error);
      await this.wikiService.removeWiki(wikiFolderPath);
      return String(error);
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
  };
}
