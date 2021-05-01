import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { WikiGitWorkspaceChannel } from '@/constants/channels';
import { INewWorkspaceConfig } from '@services/workspaces/interface';

/**
 * Deal with operations that needs to create a wiki and a git repo at once in a workspace
 */
export interface IWikiGitWorkspaceService {
  /** call git.initWikiGit , and rollback (delete created wiki folder) if it failed */
  initWikiGitTransaction(newWorkspaceConfig: INewWorkspaceConfig): Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
}
export const WikiGitWorkspaceServiceIPCDescriptor = {
  channel: WikiGitWorkspaceChannel.name,
  properties: {
    initWikiGitTransaction: ProxyPropertyType.Function,
    removeWorkspace: ProxyPropertyType.Function,
  },
};
