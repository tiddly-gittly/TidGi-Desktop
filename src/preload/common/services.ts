/**
 * Provide API from main services to GUI (for example, preference window), and tiddlywiki
 * This file should be required by WebContentsView's preload script to work
 */

import { createProxy } from 'electron-ipc-cat/client';
import { AsyncifyProxy } from 'electron-ipc-cat/common';

import { AgentBrowserServiceIPCDescriptor, IAgentBrowserService } from '@services/agentBrowser/interface';
import { AgentDefinitionServiceIPCDescriptor, IAgentDefinitionService } from '@services/agentDefinition/interface';
import { AgentInstanceServiceIPCDescriptor, IAgentInstanceService } from '@services/agentInstance/interface';
import { AuthenticationServiceIPCDescriptor, IAuthenticationService } from '@services/auth/interface';
import { ContextServiceIPCDescriptor, IContextService } from '@services/context/interface';
import { DeepLinkServiceIPCDescriptor, IDeepLinkService } from '@services/deepLink/interface';
import { GitServiceIPCDescriptor, IGitService } from '@services/git/interface';
import { IMenuService, MenuServiceIPCDescriptor } from '@services/menu/interface';
import { INativeService, NativeServiceIPCDescriptor } from '@services/native/interface';
import { INotificationService, NotificationServiceIPCDescriptor } from '@services/notifications/interface';
import { IPreferenceService, PreferenceServiceIPCDescriptor } from '@services/preferences/interface';
import { ISyncService, SyncServiceIPCDescriptor } from '@services/sync/interface';
import { ISystemPreferenceService, SystemPreferenceServiceIPCDescriptor } from '@services/systemPreferences/interface';
import { IThemeService, ThemeServiceIPCDescriptor } from '@services/theme/interface';
import { IUpdaterService, UpdaterServiceIPCDescriptor } from '@services/updater/interface';
import { IViewService, ViewServiceIPCDescriptor } from '@services/view/interface';
import { IWikiService, WikiServiceIPCDescriptor } from '@services/wiki/interface';
import { IWikiGitWorkspaceService, WikiGitWorkspaceServiceIPCDescriptor } from '@services/wikiGitWorkspace/interface';
import { IWindowService, WindowServiceIPCDescriptor } from '@services/windows/interface';
import { IWorkspaceService, WorkspaceServiceIPCDescriptor } from '@services/workspaces/interface';
import { IWorkspaceViewService, WorkspaceViewServiceIPCDescriptor } from '@services/workspacesView/interface';
import { ExternalAPIServiceIPCDescriptor, IExternalAPIService } from '../../services/externalAPI/interface';

export const agentBrowser = createProxy<AsyncifyProxy<IAgentBrowserService>>(AgentBrowserServiceIPCDescriptor);
export const agentDefinition = createProxy<AsyncifyProxy<IAgentDefinitionService>>(AgentDefinitionServiceIPCDescriptor);
export const agentInstance = createProxy<IAgentInstanceService>(AgentInstanceServiceIPCDescriptor);
export const auth = createProxy<IAuthenticationService>(AuthenticationServiceIPCDescriptor);
export const context = createProxy<IContextService>(ContextServiceIPCDescriptor);
export const deepLink = createProxy<IDeepLinkService>(DeepLinkServiceIPCDescriptor);
export const externalAPI = createProxy<IExternalAPIService>(ExternalAPIServiceIPCDescriptor);
export const git = createProxy<IGitService>(GitServiceIPCDescriptor);
export const menu = createProxy<IMenuService>(MenuServiceIPCDescriptor);
export const native = createProxy<INativeService>(NativeServiceIPCDescriptor);
export const notification = createProxy<INotificationService>(NotificationServiceIPCDescriptor);
export const preference = createProxy<IPreferenceService>(PreferenceServiceIPCDescriptor);
export const sync = createProxy<ISyncService>(SyncServiceIPCDescriptor);
export const systemPreference = createProxy<ISystemPreferenceService>(SystemPreferenceServiceIPCDescriptor);
export const theme = createProxy<IThemeService>(ThemeServiceIPCDescriptor);
export const updater = createProxy<IUpdaterService>(UpdaterServiceIPCDescriptor);
export const view = createProxy<AsyncifyProxy<IViewService>>(ViewServiceIPCDescriptor);
export const wiki = createProxy<IWikiService>(WikiServiceIPCDescriptor);
export const wikiGitWorkspace = createProxy<IWikiGitWorkspaceService>(WikiGitWorkspaceServiceIPCDescriptor);
export const window = createProxy<IWindowService>(WindowServiceIPCDescriptor);
export const workspace = createProxy<AsyncifyProxy<IWorkspaceService>>(WorkspaceServiceIPCDescriptor);
export const workspaceView = createProxy<IWorkspaceViewService>(WorkspaceViewServiceIPCDescriptor);

export const descriptors = {
  agentBrowser: AgentBrowserServiceIPCDescriptor,
  agentDefinition: AgentDefinitionServiceIPCDescriptor,
  agentInstance: AgentInstanceServiceIPCDescriptor,
  auth: AuthenticationServiceIPCDescriptor,
  context: ContextServiceIPCDescriptor,
  deepLink: DeepLinkServiceIPCDescriptor,
  git: GitServiceIPCDescriptor,
  menu: MenuServiceIPCDescriptor,
  native: NativeServiceIPCDescriptor,
  notification: NotificationServiceIPCDescriptor,
  preference: PreferenceServiceIPCDescriptor,
  sync: SyncServiceIPCDescriptor,
  systemPreference: SystemPreferenceServiceIPCDescriptor,
  theme: ThemeServiceIPCDescriptor,
  updater: UpdaterServiceIPCDescriptor,
  view: ViewServiceIPCDescriptor,
  wiki: WikiServiceIPCDescriptor,
  wikiGitWorkspace: WikiGitWorkspaceServiceIPCDescriptor,
  window: WindowServiceIPCDescriptor,
  workspace: WorkspaceServiceIPCDescriptor,
  workspaceView: WorkspaceViewServiceIPCDescriptor,
  externalAPI: ExternalAPIServiceIPCDescriptor,
};
