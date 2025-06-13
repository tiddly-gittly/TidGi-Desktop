import { WorkspaceChannel } from '@/constants/channels';
import { PageType } from '@/constants/pageTypes';
import { SupportedStorageServices } from '@services/types';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { SetOptional } from 'type-fest';

/**
 * Fields that not part of config that user can edit. Change of these field won't show "save" button on edit page.
 */
export const nonConfigFields = ['metadata', 'lastNodeJSArgv'];
/**
 * A workspace is basically a TiddlyWiki instance, it can be a local/online wiki (depends on git related config). Can be a mainWiki that starts a a TiddlyWiki instance or subwiki that link to a main wiki.
 *
 * New value added here can be init in `sanitizeWorkspace`
 */
export interface IWorkspace {
  /**
   * Is this workspace selected by user, and showing corresponding webview?
   */
  active: boolean;
  authToken?: string;
  /**
   * When this workspace is a local workspace, we can still use local git to backup
   */
  backupOnInterval: boolean;
  disableAudio: boolean;
  disableNotifications: boolean;
  enableHTTPAPI: boolean;
  /**
   * List of plugins excluded on startup, for example `['$:/plugins/bimlas/kin-filter', '$:/plugins/dullroar/sitemap']`
   */
  excludedPlugins: string[];
  /**
   * The online repo to back data up to
   */
  gitUrl: string | null;
  /**
   * Hibernate workspace on startup and when switch to another workspace.
   */
  hibernateWhenUnused: boolean;
  /**
   * Is this workspace hibernated. You can hibernate workspace manually, without setting its hibernateWhenUnused. So we record this field in workspace.
   */
  hibernated: boolean;
  /**
   * Localhost server url to load in the electron webview
   */
  homeUrl: string;
  /**
   * Mostly used for deploying blog. Need tls-key and tls-cert.
   */
  https?: {
    enabled: boolean;
    tlsCert?: string;
    tlsKey?: string;
  };
  id: string;
  /**
   * Is this workspace a subwiki that link to a main wiki, and doesn't have its own webview?
   */
  isSubWiki: boolean;
  /**
   * Nodejs start argument cli, used to start tiddlywiki server in terminal
   */
  lastNodeJSArgv?: string[];
  /**
   * Last visited url, used for rememberLastPageVisited in preferences
   */
  lastUrl: string | null;
  /**
   * ID of main wiki of the sub-wiki. Only useful when isSubWiki === true
   */
  mainWikiID: string | null;
  /**
   * Absolute path of main wiki of the sub-wiki. Only useful when isSubWiki === true , this is the wiki repo that this subwiki's folder soft links to
   */
  mainWikiToLink: string | null;
  /**
   * Display name for this wiki workspace
   */
  name: string;
  /**
   * You can drag workspaces to reorder them
   */
  order: number;
  /**
   * If this workspace represents a page (like help, guide, agent), this field indicates the page type.
   * If null or undefined, this is a regular wiki workspace.
   */
  pageType?: PageType | null;
  /**
   * workspace icon's path in file system
   */
  picturePath: string | null;
  /**
   * Localhost tiddlywiki server port
   */
  port: number;
  /**
   * Make wiki readonly if readonly is true. This is normally used for server mode, so also enable gzip.
   *
   * The principle is to configure anonymous reads, but writes require a login, and then give an unguessable username and password to.
   *
   * @url https://wiki.zhiheng.io/static/TiddlyWiki%253A%2520Readonly%2520for%2520Node.js%2520Server.html
   */
  readOnlyMode: boolean;
  /**
   * The root tiddler for wiki. When missing, may use `$:/core/save/lazy-images`
   * @url https://tiddlywiki.com/#LazyLoading
   */
  rootTiddler?: string;
  /**
   * Storage service this workspace sync to
   */
  storageService: SupportedStorageServices;
  /**
   * We basically place sub-wiki in main wiki's `tiddlers/subwiki/` folder, but the `subwiki` part can be configured. Default is `subwiki`
   */
  subWikiFolderName: string;
  /**
   * Sync wiki every interval.
   * If this is false (false by default to save the CPU usage from chokidar watch), then sync will only happen if user manually trigger by click sync button in the wiki, or sync at the app open.
   */
  syncOnInterval: boolean;
  /**
   * Commit and Sync when App starts.
   */
  syncOnStartup: boolean;
  /**
   * Tag name in tiddlywiki's filesystemPath, tiddler with this tag will be save into this subwiki
   */
  tagName: string | null;
  /**
   * Use authenticated-user-header to provide `TIDGI_AUTH_TOKEN_HEADER` as header key to receive a value as username (we use it as token)
   */
  tokenAuth: boolean;
  transparentBackground: boolean;
  userName: string;
  /**
   * folder path for this wiki workspace
   */
  wikiFolderLocation: string;
}

export interface IWorkspaceMetaData {
  badgeCount?: number;
  /**
   * Error message if this workspace fails loading
   */
  didFailLoadErrorMessage?: string | null | undefined;
  /**
   * indicating server or webpage is still loading
   */
  isLoading?: boolean;
  /**
   * Is restarting service for this workspace.
   */
  isRestarting?: boolean;
}

export interface IWorkspaceWithMetadata extends IWorkspace {
  metadata: IWorkspaceMetaData;
}
export type IWorkspacesWithMetadata = Record<string, IWorkspaceWithMetadata>;

/**
 * Ignore some field that will assign default value in workspaceService.create, these field don't require to be filled in AddWorkspace form
 */
export type INewWorkspaceConfig = SetOptional<
  Omit<IWorkspace, 'active' | 'hibernated' | 'id' | 'order' | 'lastUrl' | 'syncOnInterval' | 'syncOnStartup'>,
  'homeUrl' | 'transparentBackground' | 'picturePath' | 'disableNotifications' | 'disableAudio' | 'hibernateWhenUnused' | 'subWikiFolderName' | 'userName'
>;

/**
 * Manage workspace level preferences and workspace metadata.
 */
export interface IWorkspaceService {
  /** Enter a state that no workspace is active (show welcome page) */
  clearActiveWorkspace(oldActiveWorkspaceID: string | undefined): Promise<void>;
  /**
   * Check if a workspace exists by id
   * @param id workspace id to check
   * @returns true if workspace exists, false otherwise
   */
  exists(id: string): Promise<boolean>;
  countWorkspaces(): Promise<number>;
  create(newWorkspaceConfig: INewWorkspaceConfig): Promise<IWorkspace>;
  get(id: string): Promise<IWorkspace | undefined>;
  get$(id: string): Observable<IWorkspace | undefined>;
  /**
   * Get active workspace, if no active workspace, return the first workspace. Only when workspace list is empty, return undefined.
   */
  getActiveWorkspace: () => Promise<IWorkspace | undefined>;
  /**
   * Only meant to be used in TidGi's services internally.
   */
  getActiveWorkspaceSync: () => IWorkspace | undefined;
  getAllMetaData: () => Promise<Record<string, Partial<IWorkspaceMetaData>>>;
  getByWikiFolderLocation(wikiFolderLocation: string): Promise<IWorkspace | undefined>;
  /**
   * Get workspace by human readable wiki name, if no workspace found, return undefined. If multiple workspace with same name, return the first one order by sidebar.
   */
  getByWikiName(wikiName: string): Promise<IWorkspace | undefined>;
  getFirstWorkspace: () => Promise<IWorkspace | undefined>;
  /**
   * Get parent workspace of a subWorkspace, if the workspace you provided is a main workspace, return undefined.
   * @param subWorkspace your workspace object
   */
  getMainWorkspace(subWorkspace: IWorkspace): IWorkspace | undefined;
  getMetaData: (id: string) => Promise<Partial<IWorkspaceMetaData>>;
  getNextWorkspace: (id: string) => Promise<IWorkspace | undefined>;
  getPreviousWorkspace: (id: string) => Promise<IWorkspace | undefined>;
  getSubWorkspacesAsList(workspaceID: string): Promise<IWorkspace[]>;
  /**
   * Only meant to be used in TidGi's services internally.
   */
  getSubWorkspacesAsListSync(workspaceID: string): IWorkspace[];
  getWorkspaces(): Promise<Record<string, IWorkspace>>;
  getWorkspacesAsList(): Promise<IWorkspace[]>;
  getWorkspacesWithMetadata(): IWorkspacesWithMetadata;
  /**
   * Initialize default page workspaces on first startup
   */
  initializeDefaultPageWorkspaces(): Promise<void>;
  /**
   * Open a tiddler in the workspace, open workspace's tag by default.
   */
  openWorkspaceTiddler(workspace: IWorkspace, title?: string): Promise<void>;
  remove(id: string): Promise<void>;
  removeWorkspacePicture(id: string): Promise<void>;
  set(id: string, workspace: IWorkspace, immediate?: boolean): Promise<void>;
  /**
   * Set new workspace to active, and make the old active workspace inactive
   * @param id id to active
   */
  setActiveWorkspace(id: string, oldActiveWorkspaceID: string | undefined): Promise<void>;
  setWorkspacePicture(id: string, sourcePicturePath: string): Promise<void>;
  setWorkspaces(newWorkspaces: Record<string, IWorkspace>): Promise<void>;
  update(id: string, workspaceSetting: Partial<IWorkspace>, immediate?: boolean): Promise<void>;
  updateMetaData: (id: string, options: Partial<IWorkspaceMetaData>) => Promise<void>;
  /**
   * Manually refresh the observable's content, that will be received by react component.
   */
  updateWorkspaceSubject(): void;
  workspaceDidFailLoad(id: string): Promise<boolean>;
  workspaces$: BehaviorSubject<IWorkspacesWithMetadata | undefined>;
}
export const WorkspaceServiceIPCDescriptor = {
  channel: WorkspaceChannel.name,
  properties: {
    clearActiveWorkspace: ProxyPropertyType.Function,
    countWorkspaces: ProxyPropertyType.Function,
    create: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    get$: ProxyPropertyType.Function$,
    getActiveWorkspace: ProxyPropertyType.Function,
    getAllMetaData: ProxyPropertyType.Function,
    getByWikiName: ProxyPropertyType.Function,
    getFirstWorkspace: ProxyPropertyType.Function,
    getMainWorkspace: ProxyPropertyType.Function,
    getMetaData: ProxyPropertyType.Function,
    getNextWorkspace: ProxyPropertyType.Function,
    getPreviousWorkspace: ProxyPropertyType.Function,
    getWorkspaces: ProxyPropertyType.Function,
    getWorkspacesAsList: ProxyPropertyType.Function,
    getWorkspacesWithMetadata: ProxyPropertyType.Function,
    initializeDefaultPageWorkspaces: ProxyPropertyType.Function,
    openWorkspaceTiddler: ProxyPropertyType.Function,
    remove: ProxyPropertyType.Function,
    removeWorkspacePicture: ProxyPropertyType.Function,
    set: ProxyPropertyType.Function,
    setActiveWorkspace: ProxyPropertyType.Function,
    setWorkspacePicture: ProxyPropertyType.Function,
    setWorkspaces: ProxyPropertyType.Function,
    update: ProxyPropertyType.Function,
    updateMetaData: ProxyPropertyType.Function,
    updateWorkspaceSubject: ProxyPropertyType.Value$,
    workspaceDidFailLoad: ProxyPropertyType.Function,
    workspaces$: ProxyPropertyType.Value$,
  },
};
