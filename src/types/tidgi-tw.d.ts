import type { IAgentBrowserService } from '@services/agentBrowser/interface';
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { IAuthenticationService } from '@services/auth/interface';
import type { IContextService } from '@services/context/interface';
import type { IDatabaseService } from '@services/database/interface';
import type { IDeepLinkService } from '@services/deepLink/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import type { IGitService } from '@services/git/interface';
import type { IGitServerService } from '@services/gitServer/interface';
import type { IMenuService } from '@services/menu/interface';
import type { INativeService } from '@services/native/interface';
import type { INotificationService } from '@services/notifications/interface';
import type { IPreferenceService } from '@services/preferences/interface';
import type { ISyncService } from '@services/sync/interface';
import type { ISystemPreferenceService } from '@services/systemPreferences/interface';
import type { IThemeService } from '@services/theme/interface';
import type { IUpdaterService } from '@services/updater/interface';
import type { IViewService } from '@services/view/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWikiEmbeddingService } from '@services/wikiEmbedding/interface';
import type { IWikiGitWorkspaceService } from '@services/wikiGitWorkspace/interface';
import type { IWindowService } from '@services/windows/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { IWorkspaceViewService } from '@services/workspacesView/interface';

export type TidgiService = {
  agentBrowser: IAgentBrowserService;
  agentDefinition: IAgentDefinitionService;
  agentInstance: IAgentInstanceService;
  auth: IAuthenticationService;
  context: IContextService;
  database: IDatabaseService;
  deepLink: IDeepLinkService;
  externalAPI: IExternalAPIService;
  git: IGitService;
  gitServer?: IGitServerService;
  menu: IMenuService;
  native: INativeService;
  notification: INotificationService;
  preference: IPreferenceService;
  sync: ISyncService;
  systemPreference: ISystemPreferenceService;
  theme: IThemeService;
  updater: IUpdaterService;
  view: IViewService;
  wiki: IWikiService;
  wikiEmbedding: IWikiEmbeddingService;
  wikiGitWorkspace: IWikiGitWorkspaceService;
  window: IWindowService;
  workspace: IWorkspaceService;
  workspaceView: IWorkspaceViewService;
};

declare module 'tiddlywiki' {
  interface ITiddlyWiki {
    tidgi: {
      service: TidgiService;
    };
  }
}

export {};
