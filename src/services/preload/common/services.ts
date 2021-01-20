/**
 * Provide API from main services to GUI (for example, preference window), and tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
import { contextBridge } from 'electron';

import serviceIdentifier from '@services/serviceIdentifier';
import { IAuthenticationService, Authentication } from '@services/auth';
import { IGitService, Git } from '@services/git';
import { IMenuService, MenuService } from '@services/menu';
import { INotificationService, Notification } from '@services/notifications';
import { IPreferenceService, Preference } from '@services/preferences';
import { ISystemPreferenceService, SystemPreference } from '@services/systemPreferences';
import { IUpdaterService, Updater } from '@services/updater';
import { IViewService, View } from '@services/view';
import { IWikiService, Wiki } from '@services/wiki';
import { IWikiGitWorkspaceService, WikiGitWorkspace } from '@services/wikiGitWorkspace';
import { IWindowService, Window } from '@services/windows';
import { IWorkspaceService, Workspace } from '@services/workspaces';
import { IWorkspaceViewService, WorkspaceView } from '@services/workspacesView';

import { container } from '@services/container';

const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
const gitService = container.get<IGitService>(serviceIdentifier.Git);
const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
const notificationService = container.get<INotificationService>(serviceIdentifier.Notification);
const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
const systemPreferenceService = container.get<ISystemPreferenceService>(serviceIdentifier.SystemPreference);
const viewService = container.get<IViewService>(serviceIdentifier.View);
const updaterService = container.get<IUpdaterService>(serviceIdentifier.Updater);
const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
const wikiGitWorkspaceService = container.get<IWikiGitWorkspaceService>(serviceIdentifier.WikiGitWorkspace);
const windowService = container.get<IWindowService>(serviceIdentifier.Window);
const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);

contextBridge.exposeInMainWorld('service', {
  auth: authService,
  git: gitService,
  menu: menuService,
  notification: notificationService,
  preference: preferenceService,
  systemPreference: systemPreferenceService,
  updater: updaterService,
  view: viewService,
  wiki: wikiService,
  wikiGitWorkspace: wikiGitWorkspaceService,
  window: windowService,
  workspace: workspaceService,
  workspaceView: workspaceViewService,
});

declare global {
  interface Window {
    service: {
      auth: IAuthenticationService;
      git: IGitService;
      menu: IMenuService;
      notification: INotificationService;
      preference: IPreferenceService;
      systemPreference: ISystemPreferenceService;
      updater: IUpdaterService;
      view: IViewService;
      wiki: IWikiService;
      wikiGitWorkspace: IWikiGitWorkspaceService;
      window: IWindowService;
      workspace: IWorkspaceService;
      workspaceView: IWorkspaceViewService;
    };
  }
}
