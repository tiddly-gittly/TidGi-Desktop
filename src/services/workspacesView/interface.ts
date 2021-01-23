import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';

import { WorkspaceViewChannel } from '@/constants/channels';
import { IWorkspace } from '@services/workspaces/interface';

/**
 * Deal with operations that needs to create a workspace and a browserView at once
 */
export interface IWorkspaceViewService {
  createWorkspaceView(workspaceOptions: IWorkspace): Promise<void>;
  setWorkspaceView(id: string, workspaceOptions: IWorkspace): Promise<void>;
  setWorkspaceViews(workspaces: Record<string, IWorkspace>): Promise<void>;
  wakeUpWorkspaceView(id: string): Promise<void>;
  hibernateWorkspaceView(id: string): Promise<void>;
  setActiveWorkspaceView(id: string): Promise<void>;
  removeWorkspaceView(id: string): Promise<void>;
  clearBrowsingData(): Promise<void>;
  loadURL(url: string, id: string): Promise<void>;
  realignActiveWorkspace(): void;
}
export const WorkspaceViewServiceIPCDescriptor = {
  channel: WorkspaceViewChannel.name,
  properties: {
    createWorkspaceView: ProxyPropertyType.Function,
    setWorkspaceView: ProxyPropertyType.Function,
    setWorkspaceViews: ProxyPropertyType.Function,
    wakeUpWorkspaceView: ProxyPropertyType.Function,
    hibernateWorkspaceView: ProxyPropertyType.Function,
    setActiveWorkspaceView: ProxyPropertyType.Function,
    removeWorkspaceView: ProxyPropertyType.Function,
    clearBrowsingData: ProxyPropertyType.Function,
    loadURL: ProxyPropertyType.Function,
    realignActiveWorkspace: ProxyPropertyType.Function,
  },
};
