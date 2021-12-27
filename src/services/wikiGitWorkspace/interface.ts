import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { WikiGitWorkspaceChannel } from '@/constants/channels';
import { INewWorkspaceConfig, IWorkspace } from '@services/workspaces/interface';
import { IGitUserInfos } from '@services/git/interface';

/**
 * Deal with operations that needs to create a wiki and a git repo at once in a workspace
 */
export interface IWikiGitWorkspaceService {
  /** Create a new workspace, and call git.initWikiGit , and rollback (delete created wiki folder) if it failed */
  initWikiGitTransaction(newWorkspaceConfig: INewWorkspaceConfig, userInfo?: IGitUserInfos): Promise<IWorkspace | undefined>;
  /** register this in main.ts if syncBeforeShutdown in preference is true */
  registerSyncBeforeShutdown(): void;
  removeWorkspace: (id: string) => Promise<void>;
}
export const WikiGitWorkspaceServiceIPCDescriptor = {
  channel: WikiGitWorkspaceChannel.name,
  properties: {
    initWikiGitTransaction: ProxyPropertyType.Function,
    removeWorkspace: ProxyPropertyType.Function,
  },
};
