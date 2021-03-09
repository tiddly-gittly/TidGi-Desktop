/**
 * Don't forget to edit ./src/preload/common/services.ts to export service to renderer process
 */
import { registerProxy } from '@/helpers/electron-ipc-proxy/server';

import serviceIdentifier from '@services/serviceIdentifier';
import { container } from '@services/container';

import { Authentication } from '@services/auth';
import { ContextService } from '@services/constants';
import { Git } from '@services/git';
import { MenuService } from '@services/menu';
import { NativeService } from '@services/native';
import { NotificationService } from '@services/notifications';
import { Preference } from '@services/preferences';
import { SystemPreference } from '@services/systemPreferences';
import { Updater } from '@services/updater';
import { View } from '@services/view';
import { Wiki } from '@services/wiki';
import { WikiGitWorkspace } from '@services/wikiGitWorkspace';
import { Window } from '@services/windows';
import { Workspace } from '@services/workspaces';
import { WorkspaceView } from '@services/workspacesView';

import { IAuthenticationService, AuthenticationServiceIPCDescriptor } from '@services/auth/interface';
import { IContextService, ContextServiceIPCDescriptor } from '@services/constants/interface';
import { IGitService, GitServiceIPCDescriptor } from '@services/git/interface';
import { IMenuService, MenuServiceIPCDescriptor } from '@services/menu/interface';
import { INativeService, NativeServiceIPCDescriptor } from '@services/native/interface';
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

export function bindServiceAndProxy() {
  container.bind<IAuthenticationService>(serviceIdentifier.Authentication).to(Authentication).inSingletonScope();
  container.bind<IContextService>(serviceIdentifier.Context).to(ContextService).inSingletonScope();
  container.bind<IGitService>(serviceIdentifier.Git).to(Git).inSingletonScope();
  container.bind<IMenuService>(serviceIdentifier.MenuService).to(MenuService).inSingletonScope();
  container.bind<INativeService>(serviceIdentifier.NativeService).to(NativeService).inSingletonScope();
  container.bind<INotificationService>(serviceIdentifier.NotificationService).to(NotificationService).inSingletonScope();
  container.bind<IPreferenceService>(serviceIdentifier.Preference).to(Preference).inSingletonScope();
  container.bind<ISystemPreferenceService>(serviceIdentifier.SystemPreference).to(SystemPreference).inSingletonScope();
  container.bind<IUpdaterService>(serviceIdentifier.Updater).to(Updater).inSingletonScope();
  container.bind<IViewService>(serviceIdentifier.View).to(View).inSingletonScope();
  container.bind<IWikiService>(serviceIdentifier.Wiki).to(Wiki).inSingletonScope();
  container.bind<IWikiGitWorkspaceService>(serviceIdentifier.WikiGitWorkspace).to(WikiGitWorkspace).inSingletonScope();
  container.bind<IWindowService>(serviceIdentifier.Window).to(Window).inSingletonScope();
  container.bind<IWorkspaceService>(serviceIdentifier.Workspace).to(Workspace).inSingletonScope();
  container.bind<IWorkspaceViewService>(serviceIdentifier.WorkspaceView).to(WorkspaceView).inSingletonScope();

  const authService = container.get<IAuthenticationService>(serviceIdentifier.Authentication);
  const contextService = container.get<IContextService>(serviceIdentifier.Context);
  const gitService = container.get<IGitService>(serviceIdentifier.Git);
  const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
  const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
  const notificationService = container.get<INotificationService>(serviceIdentifier.NotificationService);
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const systemPreferenceService = container.get<ISystemPreferenceService>(serviceIdentifier.SystemPreference);
  const viewService = container.get<IViewService>(serviceIdentifier.View);
  const updaterService = container.get<IUpdaterService>(serviceIdentifier.Updater);
  const wikiService = container.get<IWikiService>(serviceIdentifier.Wiki);
  const wikiGitWorkspaceService = container.get<IWikiGitWorkspaceService>(serviceIdentifier.WikiGitWorkspace);
  const windowService = container.get<IWindowService>(serviceIdentifier.Window);
  const workspaceService = container.get<IWorkspaceService>(serviceIdentifier.Workspace);
  const workspaceViewService = container.get<IWorkspaceViewService>(serviceIdentifier.WorkspaceView);

  registerProxy(authService, AuthenticationServiceIPCDescriptor);
  registerProxy(contextService, ContextServiceIPCDescriptor);
  registerProxy(gitService, GitServiceIPCDescriptor);
  registerProxy(menuService, MenuServiceIPCDescriptor);
  registerProxy(nativeService, NativeServiceIPCDescriptor);
  registerProxy(notificationService, NotificationServiceIPCDescriptor);
  registerProxy(preferenceService, PreferenceServiceIPCDescriptor);
  registerProxy(systemPreferenceService, SystemPreferenceServiceIPCDescriptor);
  registerProxy(viewService, ViewServiceIPCDescriptor);
  registerProxy(updaterService, UpdaterServiceIPCDescriptor);
  registerProxy(wikiService, WikiServiceIPCDescriptor);
  registerProxy(wikiGitWorkspaceService, WikiGitWorkspaceServiceIPCDescriptor);
  registerProxy(windowService, WindowServiceIPCDescriptor);
  registerProxy(workspaceService, WorkspaceServiceIPCDescriptor);
  registerProxy(workspaceViewService, WorkspaceViewServiceIPCDescriptor);
}
