import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { WorkspaceChannel } from '@/constants/channels';
import { Observable, Subject } from 'rxjs';

export interface IWorkspace {
  /**
   * Is this workspace selected by user, and showing corresponding webview?
   */
  active: boolean;
  /**
   * Is this workspace hibernated
   */
  hibernated: boolean;
  /**
   * Is this workspace a subwiki that link to a main wiki, and doesn't have its own webview?
   */
  isSubWiki: boolean;
  /**
   * Only useful when isSubWiki === true , this is the wiki repo that this subwiki's folder soft links to
   */
  mainWikiToLink: string;
  /**
   * Last visited url, used for rememberLastPageVisited in preferences
   */
  lastUrl: string | null;
  /**
   * Localhost tiddlywiki server port
   */
  port: number;
  /**
   * Localhost server url to load in the electron webview
   */
  homeUrl: string;
  /**
   * The online repo to back data up to
   */
  gitUrl: string;
  id: string;
  /**
   * Display name for this wiki workspace
   */
  name: string;
  /**
   * You can drag workspaces to reorder them
   */
  order: number;
  transparentBackground: boolean;
  /**
   * Tag name in tiddlywiki's filesystemPath, tiddler with this tag will be save into this subwiki
   */
  tagName: string;
  subWikiFolderName: string;
  /**
   * workspace icon's path in file system
   */
  picturePath: string | null;
  disableNotifications: boolean;
  disableAudio: boolean;
  hibernateWhenUnused: boolean;
}

export interface IWorkspaceMetaData {
  /**
   * Error message if this workspace fails loading
   */
  didFailLoadErrorMessage: string | null | undefined;
  /**
   * indicating server or webpage is still loading
   */
  isLoading: boolean;
  badgeCount: number;
}

/**
 * Manage workspace level preferences and workspace metadata.
 */
export interface IWorkspaceService {
  workspaces$: Subject<Record<string, IWorkspace>>;
  getWorkspacesAsList(): IWorkspace[];
  get(id: string): IWorkspace | undefined;
  get$(id: string): Observable<IWorkspace | undefined>;
  create(newWorkspaceConfig: Omit<IWorkspace, 'active' | 'hibernated' | 'id' | 'order'>): Promise<IWorkspace>;
  getWorkspaces(): Record<string, IWorkspace>;
  countWorkspaces(): number;
  getMetaData: (id: string) => Partial<IWorkspaceMetaData>;
  getAllMetaData: () => Record<string, Partial<IWorkspaceMetaData>>;
  updateMetaData: (id: string, options: Partial<IWorkspaceMetaData>) => void;
  set(id: string, workspace: IWorkspace): Promise<void>;
  update(id: string, workspaceSetting: Partial<IWorkspace>): Promise<void>;
  setWorkspaces(newWorkspaces: Record<string, IWorkspace>): Promise<void>;
  setActiveWorkspace(id: string): Promise<void>;
  setWorkspacePicture(id: string, sourcePicturePath: string): Promise<void>;
  removeWorkspacePicture(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  getByName(name: string): IWorkspace | undefined;
  getPreviousWorkspace: (id: string) => IWorkspace | undefined;
  getNextWorkspace: (id: string) => IWorkspace | undefined;
  getActiveWorkspace: () => IWorkspace | undefined;
  getFirstWorkspace: () => IWorkspace | undefined;
}
export const WorkspaceServiceIPCDescriptor = {
  channel: WorkspaceChannel.name,
  properties: {
    getWorkspacesAsList: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    get$: ProxyPropertyType.Function$,
    create: ProxyPropertyType.Function,
    getWorkspaces: ProxyPropertyType.Function,
    countWorkspaces: ProxyPropertyType.Function,
    getMetaData: ProxyPropertyType.Function,
    getAllMetaData: ProxyPropertyType.Function,
    updateMetaData: ProxyPropertyType.Function,
    set: ProxyPropertyType.Function,
    update: ProxyPropertyType.Function,
    setWorkspaces: ProxyPropertyType.Function,
    setActiveWorkspace: ProxyPropertyType.Function,
    setWorkspacePicture: ProxyPropertyType.Function,
    removeWorkspacePicture: ProxyPropertyType.Function,
    remove: ProxyPropertyType.Function,
    getByName: ProxyPropertyType.Function,
    getPreviousWorkspace: ProxyPropertyType.Function,
    getNextWorkspace: ProxyPropertyType.Function,
    getActiveWorkspace: ProxyPropertyType.Function,
    getFirstWorkspace: ProxyPropertyType.Function,
  },
};
