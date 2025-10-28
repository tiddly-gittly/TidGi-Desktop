/**
 * Worker-side service proxies, similar to preload/common/services.ts
 * Auto-creates proxies for all registered services and attaches to global.service
 */

import { createWorkerProxy, type WorkerProxy } from 'electron-ipc-cat/worker';
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

// Create service proxies
export const agentBrowser = createWorkerProxy<WorkerProxy<IAgentBrowserService>>(AgentBrowserServiceIPCDescriptor, Observable);
export const agentDefinition = createWorkerProxy<WorkerProxy<IAgentDefinitionService>>(AgentDefinitionServiceIPCDescriptor, Observable);
export const agentInstance = createWorkerProxy<WorkerProxy<IAgentInstanceService>>(AgentInstanceServiceIPCDescriptor, Observable);
export const authentication = createWorkerProxy<WorkerProxy<IAuthenticationService>>(AuthenticationServiceIPCDescriptor, Observable);
export const context = createWorkerProxy<WorkerProxy<IContextService>>(ContextServiceIPCDescriptor, Observable);
export const database = createWorkerProxy<WorkerProxy<IDatabaseService>>(DatabaseServiceIPCDescriptor, Observable);
export const deepLink = createWorkerProxy<WorkerProxy<IDeepLinkService>>(DeepLinkServiceIPCDescriptor, Observable);
export const externalAPI = createWorkerProxy<WorkerProxy<IExternalAPIService>>(ExternalAPIServiceIPCDescriptor, Observable);
export const git = createWorkerProxy<WorkerProxy<IGitService>>(GitServiceIPCDescriptor, Observable);
export const menu = createWorkerProxy<WorkerProxy<IMenuService>>(MenuServiceIPCDescriptor, Observable);
export const native = createWorkerProxy<WorkerProxy<INativeService>>(NativeServiceIPCDescriptor, Observable);
export const notification = createWorkerProxy<WorkerProxy<INotificationService>>(NotificationServiceIPCDescriptor, Observable);
export const preference = createWorkerProxy<WorkerProxy<IPreferenceService>>(PreferenceServiceIPCDescriptor, Observable);
export const sync = createWorkerProxy<WorkerProxy<ISyncService>>(SyncServiceIPCDescriptor, Observable);
export const systemPreference = createWorkerProxy<WorkerProxy<ISystemPreferenceService>>(SystemPreferenceServiceIPCDescriptor, Observable);
export const theme = createWorkerProxy<WorkerProxy<IThemeService>>(ThemeServiceIPCDescriptor, Observable);
export const updater = createWorkerProxy<WorkerProxy<IUpdaterService>>(UpdaterServiceIPCDescriptor, Observable);
export const view = createWorkerProxy<WorkerProxy<IViewService>>(ViewServiceIPCDescriptor, Observable);
export const wiki = createWorkerProxy<WorkerProxy<IWikiService>>(WikiServiceIPCDescriptor, Observable);
export const wikiEmbedding = createWorkerProxy<WorkerProxy<IWikiEmbeddingService>>(WikiEmbeddingServiceIPCDescriptor, Observable);
export const wikiGitWorkspace = createWorkerProxy<WorkerProxy<IWikiGitWorkspaceService>>(WikiGitWorkspaceServiceIPCDescriptor, Observable);
export const window = createWorkerProxy<WorkerProxy<IWindowService>>(WindowServiceIPCDescriptor, Observable);
export const workspace = createWorkerProxy<WorkerProxy<IWorkspaceService>>(WorkspaceServiceIPCDescriptor, Observable);
export const workspaceView = createWorkerProxy<WorkerProxy<IWorkspaceViewService>>(WorkspaceViewServiceIPCDescriptor, Observable);

/**
 * All service proxies collected in one object
 * Auto-attached to global.service when this module is imported
 */
export const service = {
  agentBrowser,
  agentDefinition,
  agentInstance,
  authentication,
  context,
  database,
  deepLink,
  externalAPI,
  git,
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

// Auto-attach to global when imported (worker thread only)
if (typeof global !== 'undefined') {
  // Use type assertion to avoid circular reference
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (global as any).service = service;
}
