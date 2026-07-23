/**
 * Shared DTO for tiddler → workspace routing explanation.
 * Used by FileSystemAdaptor utils and exposed through wiki service IPC.
 */

export type TiddlerRoutingMatchKind = 'direct-tag' | 'tag-tree' | 'filter';

export interface ITiddlerRoutingMatch {
  workspaceId: string;
  workspaceName: string;
  isSubWiki: boolean;
  kind: TiddlerRoutingMatchKind;
  /** Human-readable chain, e.g. "RootTag → MidTag → ChildTitle", or a matched filter expression */
  chain: string;
  /** Root tag that won, when kind is tag-based */
  rootTag?: string;
}

export interface ITiddlerRoutingInfo {
  /**
   * True when the current main wiki has at least one sub-wiki with routing settings enabled
   * (tagNames and/or fileSystemPathFilter).
   */
  featureAvailable: boolean;
  match?: ITiddlerRoutingMatch;
}
