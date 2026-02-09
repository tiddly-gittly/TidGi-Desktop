import type { IAuthenticationService } from '@services/auth/interface';
import type { INativeService } from '@services/native/interface';
import type { IWikiService } from '@services/wiki/interface';
import type { IWorkspaceService } from '@services/workspaces/interface';
import type { descriptors } from '@/preload/common/services';

type TidgiService = {
  auth: IAuthenticationService;
  native: INativeService;
  workspace: IWorkspaceService;
  wiki: IWikiService;
  descriptors: typeof descriptors;
} & Record<string, unknown>;

declare module 'tiddlywiki' {
  interface ITiddlyWiki {
    tidgi: {
      service: TidgiService;
    };
  }
}

export {};
