/* eslint-disable @typescript-eslint/ban-types */
/**
 * Provide API from main services to GUI (for example, preference window), and tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
import { Asyncify, ConditionalKeys } from 'type-fest';

import { createProxy } from '@/helpers/electron-ipc-proxy/client';

import { IAuthenticationService, AuthenticationServiceIPCDescriptor } from '@services/auth/interface';
import { IContextService, ContextServiceIPCDescriptor } from '@services/constants/interface';
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

/**
 * To call services that is located in main process, from the renderer process, we use IPC.invoke, so all method should now promisify
 * Note this type only promisify methods that return things, not methods that returns observable.
 */
type AsyncifyProxy<OriginalProxy, K extends ConditionalKeys<OriginalProxy, Function> = ConditionalKeys<OriginalProxy, Function>> = {
  [P in K]: Asyncify<OriginalProxy[P]>;
};

export const auth = createProxy<AsyncifyProxy<IAuthenticationService>>(AuthenticationServiceIPCDescriptor);
export const context = createProxy<AsyncifyProxy<IContextService>>(ContextServiceIPCDescriptor);
export const git = createProxy<AsyncifyProxy<IGitService>>(GitServiceIPCDescriptor);
export const menu = createProxy<AsyncifyProxy<IMenuService>>(MenuServiceIPCDescriptor);
export const notification = createProxy<AsyncifyProxy<INotificationService>>(NotificationServiceIPCDescriptor);
export const preference = createProxy<AsyncifyProxy<IPreferenceService>>(PreferenceServiceIPCDescriptor);
export const systemPreference = createProxy<AsyncifyProxy<ISystemPreferenceService>>(SystemPreferenceServiceIPCDescriptor);
export const view = createProxy<AsyncifyProxy<IUpdaterService>>(ViewServiceIPCDescriptor);
export const updater = createProxy<AsyncifyProxy<IViewService>>(UpdaterServiceIPCDescriptor);
export const wiki = createProxy<AsyncifyProxy<IWikiService>>(WikiServiceIPCDescriptor);
export const wikiGitWorkspace = createProxy<AsyncifyProxy<IWikiGitWorkspaceService>>(WikiGitWorkspaceServiceIPCDescriptor);
export const window = createProxy<AsyncifyProxy<IWindowService>>(WindowServiceIPCDescriptor);
export const workspace = createProxy<AsyncifyProxy<IWorkspaceService>>(WorkspaceServiceIPCDescriptor);
export const workspaceView = createProxy<AsyncifyProxy<IWorkspaceViewService>>(WorkspaceViewServiceIPCDescriptor);
