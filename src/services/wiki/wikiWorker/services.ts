/**
 * Worker-side service proxies, similar to preload/common/services.ts
 * Exposed to the wiki worker and attached to $tw.tidgi.service in startNodeJSWiki
 */

import { createDefaultUtilityProcessTransport, createWorkerProxy, type WorkerProxy } from 'electron-ipc-cat/worker';
import { Observable } from 'rxjs';

import { AgentBrowserServiceIPCDescriptor, type IAgentBrowserService } from '@services/agentBrowser/interface';
import { AgentDefinitionServiceIPCDescriptor, type IAgentDefinitionService } from '@services/agentDefinition/interface';
import { AgentInstanceServiceIPCDescriptor, type IAgentInstanceService } from '@services/agentInstance/interface';
import { AuthenticationServiceIPCDescriptor, type IAuthenticationService } from '@services/auth/interface';
import { ContextServiceIPCDescriptor, type IContextService } from '@services/context/interface';
import { DatabaseServiceIPCDescriptor, type IDatabaseService } from '@services/database/interface';
import { DeepLinkServiceIPCDescriptor, type IDeepLinkService } from '@services/deepLink/interface';
import { ExternalAPIServiceIPCDescriptor, type IExternalAPIService } from '@services/externalAPI/interface';
import { GitServiceIPCDescriptor, type IGitService } from '@services/git/interface';
import { GitServerServiceIPCDescriptor, type IGitServerService } from '@services/gitServer/interface';
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
import { type IWorkspaceService, WorkspaceServiceIPCDescriptor } from '@services/workspaces/interface';
import { type IWorkspaceViewService, WorkspaceViewServiceIPCDescriptor } from '@services/workspacesView/interface';

// Create the utility process transport once — all proxies share it.
const utilityProcessTransport = createDefaultUtilityProcessTransport();

// Create service proxies
export const agentBrowser = createWorkerProxy<WorkerProxy<IAgentBrowserService>>(AgentBrowserServiceIPCDescriptor, Observable, utilityProcessTransport);
export const agentDefinition = createWorkerProxy<WorkerProxy<IAgentDefinitionService>>(AgentDefinitionServiceIPCDescriptor, Observable, utilityProcessTransport);
export const agentInstance = createWorkerProxy<WorkerProxy<IAgentInstanceService>>(AgentInstanceServiceIPCDescriptor, Observable, utilityProcessTransport);
export const auth = createWorkerProxy<WorkerProxy<IAuthenticationService>>(AuthenticationServiceIPCDescriptor, Observable, utilityProcessTransport);
export const context = createWorkerProxy<WorkerProxy<IContextService>>(ContextServiceIPCDescriptor, Observable, utilityProcessTransport);
export const database = createWorkerProxy<WorkerProxy<IDatabaseService>>(DatabaseServiceIPCDescriptor, Observable, utilityProcessTransport);
export const deepLink = createWorkerProxy<WorkerProxy<IDeepLinkService>>(DeepLinkServiceIPCDescriptor, Observable, utilityProcessTransport);
export const externalAPI = createWorkerProxy<WorkerProxy<IExternalAPIService>>(ExternalAPIServiceIPCDescriptor, Observable, utilityProcessTransport);
export const git = createWorkerProxy<WorkerProxy<IGitService>>(GitServiceIPCDescriptor, Observable, utilityProcessTransport);
export const gitServer = createWorkerProxy<WorkerProxy<IGitServerService>>(GitServerServiceIPCDescriptor, Observable, utilityProcessTransport);
export const menu = createWorkerProxy<WorkerProxy<IMenuService>>(MenuServiceIPCDescriptor, Observable, utilityProcessTransport);
export const native = createWorkerProxy<WorkerProxy<INativeService>>(NativeServiceIPCDescriptor, Observable, utilityProcessTransport);
export const notification = createWorkerProxy<WorkerProxy<INotificationService>>(NotificationServiceIPCDescriptor, Observable, utilityProcessTransport);
export const preference = createWorkerProxy<WorkerProxy<IPreferenceService>>(PreferenceServiceIPCDescriptor, Observable, utilityProcessTransport);
export const sync = createWorkerProxy<WorkerProxy<ISyncService>>(SyncServiceIPCDescriptor, Observable, utilityProcessTransport);
export const systemPreference = createWorkerProxy<WorkerProxy<ISystemPreferenceService>>(SystemPreferenceServiceIPCDescriptor, Observable, utilityProcessTransport);
export const theme = createWorkerProxy<WorkerProxy<IThemeService>>(ThemeServiceIPCDescriptor, Observable, utilityProcessTransport);
export const updater = createWorkerProxy<WorkerProxy<IUpdaterService>>(UpdaterServiceIPCDescriptor, Observable, utilityProcessTransport);
export const view = createWorkerProxy<WorkerProxy<IViewService>>(ViewServiceIPCDescriptor, Observable, utilityProcessTransport);
export const wiki = createWorkerProxy<WorkerProxy<IWikiService>>(WikiServiceIPCDescriptor, Observable, utilityProcessTransport);
export const wikiEmbedding = createWorkerProxy<WorkerProxy<IWikiEmbeddingService>>(WikiEmbeddingServiceIPCDescriptor, Observable, utilityProcessTransport);
export const wikiGitWorkspace = createWorkerProxy<WorkerProxy<IWikiGitWorkspaceService>>(WikiGitWorkspaceServiceIPCDescriptor, Observable, utilityProcessTransport);
export const window = createWorkerProxy<WorkerProxy<IWindowService>>(WindowServiceIPCDescriptor, Observable, utilityProcessTransport);
export const workspace = createWorkerProxy<WorkerProxy<IWorkspaceService>>(WorkspaceServiceIPCDescriptor, Observable, utilityProcessTransport);
export const workspaceView = createWorkerProxy<WorkerProxy<IWorkspaceViewService>>(WorkspaceViewServiceIPCDescriptor, Observable, utilityProcessTransport);

/**
 * All service proxies collected in one object
 * Attached to $tw.tidgi.service by the wiki worker bootstrap
 */
export const service = {
  agentBrowser,
  agentDefinition,
  agentInstance,
  auth,
  context,
  database,
  deepLink,
  externalAPI,
  git,
  gitServer,
  menu,
  native,
  notification,
  preference,
  sync,
  systemPreference,
  theme,
  updater,
  view,
  wiki,
  wikiEmbedding,
  wikiGitWorkspace,
  window,
  workspace,
  workspaceView,
} as const;
