import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';

import { WorkspaceViewChannel } from '@/constants/channels';
import { IWorkspace, INewWorkspaceConfig } from '@services/workspaces/interface';

/**
 * Deal with operations that needs to create a workspace and a browserView at once
 */
export interface IWorkspaceViewService {
  clearBrowsingData(): Promise<void>;
  clearBrowsingDataWithConfirm(): Promise<void>;
  /** create workspace from workspaceService to store workspace configs, and create a BrowserView to actually display wiki web content from viewService */
  createWorkspaceView(workspaceOptions: INewWorkspaceConfig): Promise<IWorkspace>;
  hibernateWorkspaceView(id: string): Promise<void>;
  /**
   * Prepare All workspaces on startup
   */
  initializeAllWorkspaceView(): Promise<void>;
  /**
   * prepare view and wiki for a workspace, work for both public and private wiki, call by `initializeAllWorkspaceView()` for all workspaces.
   */
  initializeWorkspaceView(workspace: IWorkspace): Promise<void>;
  /**
   * Try load url, if no id or no active workspace, then nothing will happened
   * @param url url to load
   * @param id workspace id, if omit, will load url in active workspace if existed
   */
  loadURL(url: string, id?: string): Promise<void>;
  openUrlInWorkspace(url: string, id: string): Promise<void>;
  realignActiveWorkspace(): Promise<void>;
  removeWorkspaceView(id: string): Promise<void>;
  setActiveWorkspaceView(id: string): Promise<void>;
  setWorkspaceView(id: string, workspaceOptions: IWorkspace): Promise<void>;
  setWorkspaceViews(workspaces: Record<string, IWorkspace>): Promise<void>;
  wakeUpWorkspaceView(id: string): Promise<void>;
}
export const WorkspaceViewServiceIPCDescriptor = {
  channel: WorkspaceViewChannel.name,
  properties: {
    initializeWorkspaceView: ProxyPropertyType.Function,
    createWorkspaceView: ProxyPropertyType.Function,
    setWorkspaceView: ProxyPropertyType.Function,
    setWorkspaceViews: ProxyPropertyType.Function,
    wakeUpWorkspaceView: ProxyPropertyType.Function,
    hibernateWorkspaceView: ProxyPropertyType.Function,
    setActiveWorkspaceView: ProxyPropertyType.Function,
    removeWorkspaceView: ProxyPropertyType.Function,
    clearBrowsingData: ProxyPropertyType.Function,
    clearBrowsingDataWithConfirm: ProxyPropertyType.Function,
    loadURL: ProxyPropertyType.Function,
    realignActiveWorkspace: ProxyPropertyType.Function,
    openUrlInWorkspace: ProxyPropertyType.Function,
  },
};
