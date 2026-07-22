/**
 * Type definitions for extended TiddlyWiki $tw.utils with routing utilities
 */

import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import type { ITiddlerRoutingInfo, TiddlerRoutingMatchKind } from './tiddlerRoutingInfo';

export interface ITiddlerRoutingExplanation {
  workspace: IWikiWorkspace;
  kind: TiddlerRoutingMatchKind;
  chain: string;
  rootTag?: string;
}

/**
 * Extended utilities interface with routing utilities
 */
export interface ExtendedUtilities {
  hasRoutingConfig(workspace: IWorkspace): boolean;
  hasActiveSubWikiRouting(workspacesWithRouting: IWikiWorkspace[], mainWorkspaceId: string): boolean;
  isWikiWorkspaceWithRouting(workspace: IWorkspace, mainWorkspaceId: string): workspace is IWikiWorkspace;
  findTagTreePath(
    rootTag: string,
    targetTitle: string,
    wiki: typeof $tw.wiki,
    maxDepth?: number,
  ): string[] | undefined;
  explainTiddlerRouting(
    tiddlerTitle: string,
    tiddlerTags: string[],
    workspacesWithRouting: IWikiWorkspace[],
    wiki: typeof $tw.wiki,
    rootWidget: typeof $tw.rootWidget,
  ): ITiddlerRoutingExplanation | undefined;
  matchTiddlerToWorkspace(
    tiddlerTitle: string,
    tiddlerTags: string[],
    workspacesWithRouting: IWikiWorkspace[],
    wiki: typeof $tw.wiki,
    rootWidget: typeof $tw.rootWidget,
  ): IWikiWorkspace | undefined;
  buildTiddlerRoutingInfo(
    tiddlerTitle: string,
    tiddlerTags: string[],
    workspacesWithRouting: IWikiWorkspace[],
    mainWorkspaceId: string,
    wiki: typeof $tw.wiki,
    rootWidget: typeof $tw.rootWidget,
  ): ITiddlerRoutingInfo;
}
