/**
 * Provide API from main services to GUI (for example, preference window), and tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
import { contextBridge } from 'electron';

import { createProxy } from '@/helpers/electron-ipc-proxy/client';

import { IAuthenticationService, AuthenticationServiceIPCDescriptor } from '@services/auth';
import { IGitService, GitServiceIPCDescriptor } from '@services/git';
import { IMenuService, MenuServiceIPCDescriptor } from '@services/menu';
import { INotificationService, NotificationServiceIPCDescriptor } from '@services/notifications';
import { IPreferenceService, PreferenceServiceIPCDescriptor } from '@services/preferences';
import { ISystemPreferenceService, SystemPreferenceServiceIPCDescriptor } from '@services/systemPreferences';
import { IUpdaterService, UpdaterServiceIPCDescriptor } from '@services/updater';
import { IViewService, ViewServiceIPCDescriptor } from '@services/view';
import { IWikiService, WikiServiceIPCDescriptor } from '@services/wiki';
import { IWikiGitWorkspaceService, WikiGitWorkspaceServiceIPCDescriptor } from '@services/wikiGitWorkspace';
import { IWindowService, WindowServiceIPCDescriptor } from '@services/windows';
import { IWorkspaceService, WorkspaceServiceIPCDescriptor } from '@services/workspaces';
import { IWorkspaceViewService, WorkspaceViewServiceIPCDescriptor } from '@services/workspacesView';

const authService = createProxy(AuthenticationServiceIPCDescriptor);
const gitService = createProxy(GitServiceIPCDescriptor);
const menuService = createProxy(MenuServiceIPCDescriptor);
const notificationService = createProxy(NotificationServiceIPCDescriptor);
const preferenceService = createProxy(PreferenceServiceIPCDescriptor);
const systemPreferenceService = createProxy(SystemPreferenceServiceIPCDescriptor);
const viewService = createProxy(ViewServiceIPCDescriptor);
const updaterService = createProxy(UpdaterServiceIPCDescriptor);
const wikiService = createProxy(WikiServiceIPCDescriptor);
const wikiGitWorkspaceService = createProxy(WikiGitWorkspaceServiceIPCDescriptor);
const windowService = createProxy(WindowServiceIPCDescriptor);
const workspaceService = createProxy(WorkspaceServiceIPCDescriptor);
const workspaceViewService = createProxy(WorkspaceViewServiceIPCDescriptor);

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
