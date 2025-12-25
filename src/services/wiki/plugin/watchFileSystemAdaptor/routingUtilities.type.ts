/**
 * Type definitions for extended TiddlyWiki $tw.utils with routing utilities
 */

import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import type { IFileInfo } from 'tiddlywiki';

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
  moveExternalAttachmentIfNeeded(
    canonicalUri: string | undefined,
    oldFileInfo: IFileInfo | undefined,
    newFileInfo: IFileInfo,
    wikisWithRouting: IWikiWorkspace[],
  ): Promise<void>;
  getWikiRootFromTiddlerPath(
    tiddlerDirectory: string,
    wikisWithRouting: IWikiWorkspace[],
  ): string | undefined;
}
