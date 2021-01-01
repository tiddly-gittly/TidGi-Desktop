export interface IService {
  init?: (...parameters: never[]) => Promise<void>;
}

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
}

export interface IWorkspaceMetaData {
  /**
   * Error message if this workspace fails loading
   */
  didFailLoadErrorMessage: string | undefined;
  /**
   * indicating server or webpage is still loading
   */
  isLoading: boolean;
  badgeCount: number;
}
