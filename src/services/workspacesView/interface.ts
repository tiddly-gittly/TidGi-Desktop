import { ProxyPropertyType } from 'electron-ipc-cat/common';

import { WorkspaceViewChannel } from '@/constants/channels';
import { IWorkspace, INewWorkspaceConfig } from '@services/workspaces/interface';

export interface IInitializeWorkspaceOptions {
  /**
   * When initialize workspace view, check its hibernate setting, if if true then hibernate it.
   * Close this if you want to initialize workspace view without hibernate it, regardless of its setting (for example, when you want to wake up a hibernated workspace).
   */
  followHibernateSettingWhenInit?: boolean;
  isNew?: boolean;
  syncImmediately?: boolean;
}
/**
 * Deal with operations that needs to create a workspace and a browserView at once
 */
export interface IWorkspaceViewService {
  clearBrowsingData(): Promise<void>;
  clearBrowsingDataWithConfirm(): Promise<void>;
  hibernateWorkspaceView(id: string): Promise<void>;
  /**
   * Prepare All workspaces on startup
   */
  initializeAllWorkspaceView(): Promise<void>;
  /**
   * prepare view and wiki for a workspace, work for both public and private wiki, call by `initializeAllWorkspaceView()` for all workspaces.
   */
  initializeWorkspaceView(workspace: IWorkspace, options?: IInitializeWorkspaceOptions): Promise<void>;
  /**
   * Try load url, if no id or no active workspace, then nothing will happened
   * @param url url to load
   * @param id workspace id, if omit, will load url in active workspace if existed
   */
  loadURL(url: string, workspaceID?: string): Promise<void>;
  openUrlInWorkspace(url: string, workspaceID: string): Promise<void>;
  printTiddler(tiddlerName?: string | undefined): Promise<void>;
  realignActiveWorkspace(): Promise<void>;
  /**
   * Remove workspace metadata and its view (if it is started and have a browser view)
   */
  removeWorkspaceView(workspaceID: string): Promise<void>;
  restartWorkspaceViewService(workspaceID?: string | undefined): Promise<void>;
  setActiveWorkspaceView(workspaceID: string): Promise<void>;
  setWorkspaceView(workspaceID: string, workspaceOptions: IWorkspace): Promise<void>;
  setWorkspaceViews(workspaces: Record<string, IWorkspace>): Promise<void>;
  /** get view's current url, store into the workspace. Can provide a designated view to operate  */
  updateLastUrl(workspaceID: string, view?: Electron.CrossProcessExports.BrowserView | undefined): Promise<void>;
  wakeUpWorkspaceView(workspaceID: string): Promise<void>;
}
export const WorkspaceViewServiceIPCDescriptor = {
  channel: WorkspaceViewChannel.name,
  properties: {
    clearBrowsingData: ProxyPropertyType.Function,
    clearBrowsingDataWithConfirm: ProxyPropertyType.Function,
    hibernateWorkspaceView: ProxyPropertyType.Function,
    initializeWorkspaceView: ProxyPropertyType.Function,
    loadURL: ProxyPropertyType.Function,
    openUrlInWorkspace: ProxyPropertyType.Function,
    printTiddler: ProxyPropertyType.Function,
    realignActiveWorkspace: ProxyPropertyType.Function,
    removeWorkspaceView: ProxyPropertyType.Function,
    restartWorkspaceViewService: ProxyPropertyType.Function,
    setActiveWorkspaceView: ProxyPropertyType.Function,
    setWorkspaceView: ProxyPropertyType.Function,
    setWorkspaceViews: ProxyPropertyType.Function,
    updateLastUrl: ProxyPropertyType.Function,
    wakeUpWorkspaceView: ProxyPropertyType.Function,
  },
};
