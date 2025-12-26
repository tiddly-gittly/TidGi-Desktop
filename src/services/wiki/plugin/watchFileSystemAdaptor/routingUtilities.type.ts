/**
 * Type definitions for extended TiddlyWiki $tw.utils with routing utilities
 */

import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';

/**
 * Extended utilities interface with routing utilities
 */
export interface ExtendedUtilities {
  isWikiWorkspaceWithRouting(workspace: IWorkspace, mainWorkspaceId: string): workspace is IWikiWorkspace;
  matchTiddlerToWorkspace(
    tiddlerTitle: string,
    tiddlerTags: string[],
    workspacesWithRouting: IWikiWorkspace[],
    wiki: typeof $tw.wiki,
    rootWidget: typeof $tw.rootWidget,
  ): IWikiWorkspace | undefined;
}
