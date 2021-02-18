import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { WikiGitWorkspaceChannel } from '@/constants/channels';
import { IAuthingUserInfo } from '@services/types';

/**
 * Deal with operations that needs to create a wiki and a git repo at once in a workspace
 */
export interface IWikiGitWorkspaceService {
  initWikiGitTransaction: (wikiFolderPath: string, githubRepoUrl: string, userInfo: IAuthingUserInfo, isMainWiki: boolean) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
}
export const WikiGitWorkspaceServiceIPCDescriptor = {
  channel: WikiGitWorkspaceChannel.name,
  properties: {
    initWikiGitTransaction: ProxyPropertyType.Function,
    removeWorkspace: ProxyPropertyType.Function,
  },
};
