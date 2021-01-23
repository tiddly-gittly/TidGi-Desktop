import { registerProxy } from '@/helpers/electron-ipc-proxy/server';

import { IAuthenticationService, Authentication, AuthenticationServiceIPCDescriptor } from '@services/auth';
import { IGitService, Git, GitServiceIPCDescriptor } from '@services/git';
import { IMenuService, MenuService, MenuServiceIPCDescriptor } from '@services/menu';
import { INotificationService, Notification, NotificationServiceIPCDescriptor } from '@services/notifications';
import { IPreferenceService, Preference, PreferenceServiceIPCDescriptor } from '@services/preferences';
import { ISystemPreferenceService, SystemPreference, SystemPreferenceServiceIPCDescriptor } from '@services/systemPreferences';
import { IUpdaterService, Updater, UpdaterServiceIPCDescriptor } from '@services/updater';
import { IViewService, View, ViewServiceIPCDescriptor } from '@services/view';
import { IWikiService, Wiki, WikiServiceIPCDescriptor } from '@services/wiki';
import { IWikiGitWorkspaceService, WikiGitWorkspace, WikiGitWorkspaceServiceIPCDescriptor } from '@services/wikiGitWorkspace';
import { IWindowService, Window, WindowServiceIPCDescriptor } from '@services/windows';
import { IWorkspaceService, Workspace, WorkspaceServiceIPCDescriptor } from '@services/workspaces';
import { IWorkspaceViewService, WorkspaceView, WorkspaceViewServiceIPCDescriptor } from '@services/workspacesView';

import serviceIdentifier from '@services/serviceIdentifier';
import { container } from '@services/container';

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
