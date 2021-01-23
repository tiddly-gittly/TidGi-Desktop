import { ProxyPropertyType } from '@/helpers/electron-ipc-proxy/common';
import { WikiGitWorkspaceChannel } from '@/constants/channels';
import { IUserInfo } from '@services/types';

/**
 * Deal with operations that needs to create a wiki and a git repo at once in a workspace
 */
export interface IWikiGitWorkspaceService {
  initWikiGit: (wikiFolderPath: string, githubRepoUrl: string, userInfo: IUserInfo, isMainWiki: boolean) => Promise<string>;
  removeWorkspace: (id: string) => Promise<void>;
}
export const WikiGitWorkspaceServiceIPCDescriptor = {
  channel: WikiGitWorkspaceChannel.name,
  properties: {
    initWikiGit: ProxyPropertyType.Function,
    removeWorkspace: ProxyPropertyType.Function,
  },
};
