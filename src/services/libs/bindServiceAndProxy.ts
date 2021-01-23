import { registerProxy } from '@/helpers/electron-ipc-proxy/server';

import serviceIdentifier from '@services/serviceIdentifier';
import { container } from '@services/container';

import { Authentication } from '@services/auth';
import { Git } from '@services/git';
import { MenuService } from '@services/menu';
import { Notification } from '@services/notifications';
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

container.bind<Authentication>(serviceIdentifier.Authentication).to(Authentication).inSingletonScope();
container.bind<Git>(serviceIdentifier.Git).to(Git).inSingletonScope();
container.bind<MenuService>(serviceIdentifier.MenuService).to(MenuService).inSingletonScope();
container.bind<Notification>(serviceIdentifier.Notification).to(Notification).inSingletonScope();
container.bind<Preference>(serviceIdentifier.Preference).to(Preference).inSingletonScope();
container.bind<SystemPreference>(serviceIdentifier.SystemPreference).to(SystemPreference).inSingletonScope();
container.bind<Updater>(serviceIdentifier.Updater).to(Updater).inSingletonScope();
container.bind<View>(serviceIdentifier.View).to(View).inSingletonScope();
container.bind<Wiki>(serviceIdentifier.Wiki).to(Wiki).inSingletonScope();
container.bind<WikiGitWorkspace>(serviceIdentifier.WikiGitWorkspace).to(WikiGitWorkspace).inSingletonScope();
container.bind<Window>(serviceIdentifier.Window).to(Window).inSingletonScope();
container.bind<Workspace>(serviceIdentifier.Workspace).to(Workspace).inSingletonScope();
container.bind<WorkspaceView>(serviceIdentifier.WorkspaceView).to(WorkspaceView).inSingletonScope();

// TODO: delay service init, call init() manually
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

registerProxy(authService, AuthenticationServiceIPCDescriptor);
registerProxy(gitService, GitServiceIPCDescriptor);
registerProxy(menuService, MenuServiceIPCDescriptor);
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
