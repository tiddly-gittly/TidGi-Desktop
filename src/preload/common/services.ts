/**
 * Provide API from main services to GUI (for example, preference window), and tiddlywiki
 * This file should be required by WebContentsView's preload script to work
 */

import { createProxy } from 'electron-ipc-cat/client';
import { AsyncifyProxy } from 'electron-ipc-cat/common';

import { AgentBrowserServiceIPCDescriptor, type IAgentBrowserService } from '@services/agentBrowser/interface';
import { AgentDefinitionServiceIPCDescriptor, type IAgentDefinitionService } from '@services/agentDefinition/interface';
import { AgentInstanceServiceIPCDescriptor, type IAgentInstanceService } from '@services/agentInstance/interface';
import { AuthenticationServiceIPCDescriptor, type IAuthenticationService } from '@services/auth/interface';
import { ContextServiceIPCDescriptor, type IContextService } from '@services/context/interface';
import { DatabaseServiceIPCDescriptor, type IDatabaseService } from '@services/database/interface';
import { DeepLinkServiceIPCDescriptor, type IDeepLinkService } from '@services/deepLink/interface';
import { ExternalAPIServiceIPCDescriptor, type IExternalAPIService } from '@services/externalAPI/interface';
import { GitServiceIPCDescriptor, type IGitService } from '@services/git/interface';
import { type IMenuService, MenuServiceIPCDescriptor } from '@services/menu/interface';
import { type INativeService, NativeServiceIPCDescriptor } from '@services/native/interface';
import { type INotificationService, NotificationServiceIPCDescriptor } from '@services/notifications/interface';
import { type IPreferenceService, PreferenceServiceIPCDescriptor } from '@services/preferences/interface';
import { type ISyncService, SyncServiceIPCDescriptor } from '@services/sync/interface';
import { type ISystemPreferenceService, SystemPreferenceServiceIPCDescriptor } from '@services/systemPreferences/interface';
import { type IThemeService, ThemeServiceIPCDescriptor } from '@services/theme/interface';
import { type IUpdaterService, UpdaterServiceIPCDescriptor } from '@services/updater/interface';
import { type IViewService, ViewServiceIPCDescriptor } from '@services/view/interface';
import { type IWikiService, WikiServiceIPCDescriptor } from '@services/wiki/interface';
import { type IWikiEmbeddingService, WikiEmbeddingServiceIPCDescriptor } from '@services/wikiEmbedding/interface';
import { type IWikiGitWorkspaceService, WikiGitWorkspaceServiceIPCDescriptor } from '@services/wikiGitWorkspace/interface';
import { type IWindowService, WindowServiceIPCDescriptor } from '@services/windows/interface';
import { type IWorkspaceGroupService, WorkspaceGroupServiceIPCDescriptor } from '@services/workspaceGroup/interface';
import { type IWorkspaceService, WorkspaceServiceIPCDescriptor } from '@services/workspaces/interface';
import { type IWorkspaceViewService, WorkspaceViewServiceIPCDescriptor } from '@services/workspacesView/interface';

export const agentBrowser = createProxy<AsyncifyProxy<IAgentBrowserService>>(AgentBrowserServiceIPCDescriptor);
export const agentDefinition = createProxy<AsyncifyProxy<IAgentDefinitionService>>(AgentDefinitionServiceIPCDescriptor);
export const agentInstance = createProxy<AsyncifyProxy<IAgentInstanceService>>(AgentInstanceServiceIPCDescriptor);
export const auth = createProxy<IAuthenticationService>(AuthenticationServiceIPCDescriptor);
export const context = createProxy<IContextService>(ContextServiceIPCDescriptor);
export const deepLink = createProxy<IDeepLinkService>(DeepLinkServiceIPCDescriptor);
export const externalAPI = createProxy<IExternalAPIService>(ExternalAPIServiceIPCDescriptor);
export const database = createProxy<IDatabaseService>(DatabaseServiceIPCDescriptor);
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
export const wikiEmbedding = createProxy<IWikiEmbeddingService>(WikiEmbeddingServiceIPCDescriptor);
export const wikiGitWorkspace = createProxy<IWikiGitWorkspaceService>(WikiGitWorkspaceServiceIPCDescriptor);
export const window = createProxy<IWindowService>(WindowServiceIPCDescriptor);
export const workspace = createProxy<AsyncifyProxy<IWorkspaceService>>(WorkspaceServiceIPCDescriptor);
export const workspaceGroup = createProxy<AsyncifyProxy<IWorkspaceGroupService>>(WorkspaceGroupServiceIPCDescriptor);
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
  wikiEmbedding: WikiEmbeddingServiceIPCDescriptor,
  wikiGitWorkspace: WikiGitWorkspaceServiceIPCDescriptor,
  window: WindowServiceIPCDescriptor,
  workspace: WorkspaceServiceIPCDescriptor,
  workspaceGroup: WorkspaceGroupServiceIPCDescriptor,
  workspaceView: WorkspaceViewServiceIPCDescriptor,
  externalAPI: ExternalAPIServiceIPCDescriptor,
  database: DatabaseServiceIPCDescriptor,
};
