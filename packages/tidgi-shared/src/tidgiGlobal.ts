/**
 * Shared shape for TidGi service access in TW sandbox.
 */
import type { IGitService } from '@services/git/interface';
import type { IGitServerService } from '@services/gitServer/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';

export interface ITidGiGlobalService {
  git: IGitService;
  gitServer?: IGitServerService;
  workspace: IWorkspaceService;
}

export type TidgiTwGlobal = {
  tidgi?: {
    service?: ITidGiGlobalService;
  };
};
