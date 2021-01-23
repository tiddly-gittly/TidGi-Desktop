/**
 * Provide API from main services to GUI (for example, preference window), and tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
import { contextBridge } from 'electron';

import { createProxy } from '@/helpers/electron-ipc-proxy/client';

import { IAuthenticationService, AuthenticationServiceIPCDescriptor } from '@services/auth/interface';
import { IGitService, GitServiceIPCDescriptor } from '@services/git/interface';
import { IMenuService, MenuServiceIPCDescriptor } from '@services/menu/interface';
import { INotificationService, NotificationServiceIPCDescriptor } from '@services/notifications/interface';
import { IPreferenceService, PreferenceServiceIPCDescriptor } from '@services/preferences/interface';
import { ISystemPreferenceService, SystemPreferenceServiceIPCDescriptor } from '@services/systemPreferences/interface';
import { IUpdaterService, UpdaterServiceIPCDescriptor } from '@services/updater/interface';
import { IViewService, ViewServiceIPCDescriptor } from '@services/view/interface';
import { IWikiService, WikiServiceIPCDescriptor } from '@services/wiki/interface';
import { IWikiGitWorkspaceService, WikiGitWorkspaceServiceIPCDescriptor } from '@services/wikiGitWorkspace/interface';
import { IWindowService, WindowServiceIPCDescriptor } from '@services/windows/interface';
import { IWorkspaceService, WorkspaceServiceIPCDescriptor } from '@services/workspaces/interface';
import { IWorkspaceViewService, WorkspaceViewServiceIPCDescriptor } from '@services/workspacesView/interface';

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
