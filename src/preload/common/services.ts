/* eslint-disable @typescript-eslint/ban-types */
/**
 * Provide API from main services to GUI (for example, preference window), and tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
import { Asyncify, ConditionalKeys } from 'type-fest';
import { Observable } from 'rxjs';

import { createProxy } from '@/helpers/electron-ipc-proxy/client';

import { IAuthenticationService, AuthenticationServiceIPCDescriptor } from '@services/auth/interface';
import { IContextService, ContextServiceIPCDescriptor } from '@services/constants/interface';
import { IGitService, GitServiceIPCDescriptor } from '@services/git/interface';
import { IMenuService, MenuServiceIPCDescriptor } from '@services/menu/interface';
import { INativeService, NativeServiceIPCDescriptor } from '@services/native/interface';
import { INotificationService, NotificationServiceIPCDescriptor } from '@services/notifications/interface';
import { IPreferenceService, PreferenceServiceIPCDescriptor } from '@services/preferences/interface';
import { ISystemPreferenceService, SystemPreferenceServiceIPCDescriptor } from '@services/systemPreferences/interface';
import { IThemeService, ThemeServiceIPCDescriptor } from '@services/theme/interface';
import { IUpdaterService, UpdaterServiceIPCDescriptor } from '@services/updater/interface';
import { IViewService, ViewServiceIPCDescriptor } from '@services/view/interface';
import { IWikiService, WikiServiceIPCDescriptor } from '@services/wiki/interface';
import { IWikiGitWorkspaceService, WikiGitWorkspaceServiceIPCDescriptor } from '@services/wikiGitWorkspace/interface';
import { IWindowService, WindowServiceIPCDescriptor } from '@services/windows/interface';
import { IWorkspaceService, WorkspaceServiceIPCDescriptor } from '@services/workspaces/interface';
import { IWorkspaceViewService, WorkspaceViewServiceIPCDescriptor } from '@services/workspacesView/interface';

type ProxyAsyncProperties<OriginalProxy> = ConditionalKeys<OriginalProxy, Function>;
type ProxyObservableProperties<OriginalProxy> =
  | ConditionalKeys<OriginalProxy, Observable<unknown>>
  | ConditionalKeys<OriginalProxy, (...arguments_: any[]) => Observable<unknown>>;
/**
 * To call services that is located in main process, from the renderer process, we use IPC.invoke, so all method should now promisify
 * Note this type only promisify methods that return things, not methods that returns observable.
 */
type AsyncifyProxy<
  OriginalProxy,
  ObservableKey extends ProxyObservableProperties<OriginalProxy> = ProxyObservableProperties<OriginalProxy>,
  AsyncKey extends Exclude<ProxyAsyncProperties<OriginalProxy>, ObservableKey> = Exclude<ProxyAsyncProperties<OriginalProxy>, ObservableKey>
> = {
  [P in AsyncKey]: Asyncify<OriginalProxy[P]>;
} &
  {
    [Q in ObservableKey]: OriginalProxy[Q];
  };

type IPCProxy<OriginalProxy> = AsyncifyProxy<OriginalProxy>;

export const auth = createProxy<IPCProxy<IAuthenticationService>>(AuthenticationServiceIPCDescriptor);
export const context = createProxy<IPCProxy<IContextService>>(ContextServiceIPCDescriptor);
export const git = createProxy<IPCProxy<IGitService>>(GitServiceIPCDescriptor);
export const menu = createProxy<IPCProxy<IMenuService>>(MenuServiceIPCDescriptor);
export const native = createProxy<IPCProxy<INativeService>>(NativeServiceIPCDescriptor);
export const notification = createProxy<IPCProxy<INotificationService>>(NotificationServiceIPCDescriptor);
export const preference = createProxy<IPCProxy<IPreferenceService>>(PreferenceServiceIPCDescriptor);
export const systemPreference = createProxy<IPCProxy<ISystemPreferenceService>>(SystemPreferenceServiceIPCDescriptor);
export const theme = createProxy<IPCProxy<IThemeService>>(ThemeServiceIPCDescriptor);
export const updater = createProxy<IPCProxy<IUpdaterService>>(UpdaterServiceIPCDescriptor);
export const view = createProxy<IPCProxy<IViewService>>(ViewServiceIPCDescriptor);
export const wiki = createProxy<IPCProxy<IWikiService>>(WikiServiceIPCDescriptor);
export const wikiGitWorkspace = createProxy<IPCProxy<IWikiGitWorkspaceService>>(WikiGitWorkspaceServiceIPCDescriptor);
export const window = createProxy<IPCProxy<IWindowService>>(WindowServiceIPCDescriptor);
export const workspace = createProxy<IPCProxy<IWorkspaceService>>(WorkspaceServiceIPCDescriptor);
export const workspaceView = createProxy<IPCProxy<IWorkspaceViewService>>(WorkspaceViewServiceIPCDescriptor);
