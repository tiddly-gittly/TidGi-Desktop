import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import { workspaceSorter } from '@services/workspaces/utilities';
import type { ITiddlerRoutingExplanation } from './routingUtilities.type';
import type { ITiddlerRoutingInfo } from './tiddlerRoutingInfo';

/**
 * Sub-wiki routing utilities for matching tiddlers/files to workspaces.
 * These utilities are exposed as $tw.utils functions for use in plugins / IPC APIs.
 */

/**
 * Check if a workspace has routing configuration (tagNames or fileSystemPathFilter).
 */
function hasRoutingConfig(workspaceItem: IWorkspace): boolean {
  const hasTagNames = 'tagNames' in workspaceItem && Array.isArray(workspaceItem.tagNames) && workspaceItem.tagNames.length > 0;
  const hasFilter = 'fileSystemPathFilterEnable' in workspaceItem &&
    workspaceItem.fileSystemPathFilterEnable &&
    'fileSystemPathFilter' in workspaceItem &&
    Boolean(workspaceItem.fileSystemPathFilter);
  return hasTagNames || hasFilter;
}

/**
 * True when there is at least one sub-wiki (of this main wiki) that has routing config enabled.
 */
function hasActiveSubWikiRouting(
  workspacesWithRouting: IWikiWorkspace[],
  mainWorkspaceId: string,
): boolean {
  return workspacesWithRouting.some((workspaceItem) =>
    workspaceItem.isSubWiki &&
    workspaceItem.mainWikiID === mainWorkspaceId &&
    hasRoutingConfig(workspaceItem)
  );
}

/**
 * Check if a workspace is a wiki workspace with routing configuration.
 * This filters to wiki workspaces that are either the main workspace or sub-wikis of it.
 */
function isWikiWorkspaceWithRouting(
  workspaceItem: IWorkspace,
  mainWorkspaceId: string,
): workspaceItem is IWikiWorkspace {
  if (!('wikiFolderLocation' in workspaceItem) || !workspaceItem.wikiFolderLocation) {
    return false;
  }

  if (!hasRoutingConfig(workspaceItem)) {
    return false;
  }

  const isMain = workspaceItem.id === mainWorkspaceId;
  const isSubWiki = 'isSubWiki' in workspaceItem &&
    workspaceItem.isSubWiki &&
    'mainWikiID' in workspaceItem &&
    workspaceItem.mainWikiID === mainWorkspaceId;

  return isMain || isSubWiki;
}

/**
 * Check if a tiddler matches a workspace's direct tag routing.
 */
function matchesDirectTag(
  tiddlerTitle: string,
  tiddlerTags: string[],
  workspaceTagNames: string[],
): boolean {
  return getDirectTagMatch(tiddlerTitle, tiddlerTags, workspaceTagNames) !== undefined;
}

/**
 * Return the workspace tagName that directly matches this tiddler, if any.
 */
function getDirectTagMatch(
  tiddlerTitle: string,
  tiddlerTags: string[],
  workspaceTagNames: string[],
): string | undefined {
  if (workspaceTagNames.length === 0) {
    return undefined;
  }

  if (workspaceTagNames.includes(tiddlerTitle)) {
    return tiddlerTitle;
  }

  return workspaceTagNames.find((tagName) => tiddlerTags.includes(tagName));
}

/**
 * Find a downward tag-tree path from root to target using getTiddlersWithTag BFS.
 */
function findTagTreePath(
  rootTag: string,
  targetTitle: string,
  wiki: typeof $tw.wiki,
  maxDepth = 32,
): string[] | undefined {
  if (typeof wiki.getTiddlersWithTag !== 'function') {
    return undefined;
  }

  if (rootTag === targetTitle) {
    return [rootTag];
  }

  const queue: string[][] = [[rootTag]];
  const seen = new Set<string>([rootTag]);
  let head = 0;

  while (head < queue.length) {
    const currentPath = queue[head++];
    if (currentPath.length > maxDepth) {
      continue;
    }
    const last = currentPath[currentPath.length - 1];
    const children = wiki.getTiddlersWithTag(last) ?? [];
    for (const child of children) {
      if (child === targetTitle) {
        return [...currentPath, child];
      }
      if (!seen.has(child)) {
        seen.add(child);
        queue.push([...currentPath, child]);
      }
    }
  }

  return undefined;
}

/**
 * Check if a tiddler matches a workspace's tag tree routing.
 * Uses TiddlyWiki's in-tagtree-of filter for recursive tag hierarchy matching.
 */
function matchesTagTree(
  tiddlerTitle: string,
  workspaceTagNames: string[],
  wiki: typeof $tw.wiki,
  rootWidget: typeof $tw.rootWidget,
): boolean {
  for (const tagName of workspaceTagNames) {
    const result = wiki.filterTiddlers(
      `[in-tagtree-of:inclusive<tagName>]`,
      rootWidget.makeFakeWidgetWithVariables({ tagName }),
      wiki.makeTiddlerIterator([tiddlerTitle]),
    );
    if (result.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a tiddler matches a workspace's custom filter routing.
 * Filters are separated by newlines; any match wins.
 */
function matchesCustomFilter(
  tiddlerTitle: string,
  filterExpression: string,
  wiki: typeof $tw.wiki,
): boolean {
  return getMatchedCustomFilter(tiddlerTitle, filterExpression, wiki) !== undefined;
}

function getMatchedCustomFilter(
  tiddlerTitle: string,
  filterExpression: string,
  wiki: typeof $tw.wiki,
): string | undefined {
  const filters = filterExpression.split('\n').map((f) => f.trim()).filter((f) => f.length > 0);

  for (const filter of filters) {
    const result = wiki.filterTiddlers(filter, undefined, wiki.makeTiddlerIterator([tiddlerTitle]));
    if (result.length > 0) {
      return filter;
    }
  }

  return undefined;
}

/**
 * Explain why a tiddler is routed to a workspace (same priority rules as save routing).
 * Workspaces must already be sorted by the product's routing priority.
 */
function explainTiddlerRouting(
  tiddlerTitle: string,
  tiddlerTags: string[],
  workspacesWithRouting: IWikiWorkspace[],
  wiki: typeof $tw.wiki,
  rootWidget: typeof $tw.rootWidget,
): ITiddlerRoutingExplanation | undefined {
  for (const workspaceItem of workspacesWithRouting) {
    const directRoot = getDirectTagMatch(tiddlerTitle, tiddlerTags, workspaceItem.tagNames);
    if (directRoot !== undefined) {
      const chain = directRoot === tiddlerTitle ? directRoot : `${directRoot} → ${tiddlerTitle}`;
      return {
        workspace: workspaceItem,
        kind: 'direct-tag',
        chain,
        rootTag: directRoot,
      };
    }

    if (workspaceItem.includeTagTree && workspaceItem.tagNames.length > 0) {
      for (const rootTag of workspaceItem.tagNames) {
        // Match with the same operator used by save routing.
        const matched = wiki.filterTiddlers(
          `[in-tagtree-of:inclusive<tagName>]`,
          rootWidget.makeFakeWidgetWithVariables({ tagName: rootTag }),
          wiki.makeTiddlerIterator([tiddlerTitle]),
        );
        if (matched.length > 0) {
          const path = findTagTreePath(rootTag, tiddlerTitle, wiki) ?? [rootTag, tiddlerTitle];
          return {
            workspace: workspaceItem,
            kind: 'tag-tree',
            chain: path.join(' → '),
            rootTag,
          };
        }
      }
    }

    if (workspaceItem.fileSystemPathFilterEnable && workspaceItem.fileSystemPathFilter) {
      const matchedFilter = getMatchedCustomFilter(tiddlerTitle, workspaceItem.fileSystemPathFilter, wiki);
      if (matchedFilter !== undefined) {
        return {
          workspace: workspaceItem,
          kind: 'filter',
          chain: matchedFilter,
        };
      }
    }
  }

  return undefined;
}

/**
 * Match a tiddler to a workspace based on routing rules.
 * Checks workspaces in order (priority) and returns the first match.
 */
function matchTiddlerToWorkspace(
  tiddlerTitle: string,
  tiddlerTags: string[],
  workspacesWithRouting: IWikiWorkspace[],
  wiki: typeof $tw.wiki,
  rootWidget: typeof $tw.rootWidget,
): IWikiWorkspace | undefined {
  return explainTiddlerRouting(tiddlerTitle, tiddlerTags, workspacesWithRouting, wiki, rootWidget)?.workspace;
}

/**
 * Build the IPC/UI payload for a tiddler's routing decision.
 */
function buildTiddlerRoutingInfo(
  tiddlerTitle: string,
  tiddlerTags: string[],
  workspacesWithRouting: IWikiWorkspace[],
  mainWorkspaceId: string,
  wiki: typeof $tw.wiki,
  rootWidget: typeof $tw.rootWidget,
): ITiddlerRoutingInfo {
  const featureAvailable = hasActiveSubWikiRouting(workspacesWithRouting, mainWorkspaceId);
  if (!featureAvailable) {
    return { featureAvailable: false };
  }

  const explanation = explainTiddlerRouting(tiddlerTitle, tiddlerTags, workspacesWithRouting, wiki, rootWidget);
  if (!explanation) {
    return { featureAvailable: true };
  }

  return {
    featureAvailable: true,
    match: {
      workspaceId: explanation.workspace.id,
      workspaceName: explanation.workspace.name,
      isSubWiki: explanation.workspace.isSubWiki,
      kind: explanation.kind,
      chain: explanation.chain,
      rootTag: explanation.rootTag,
    },
  };
}

declare const exports: Record<string, unknown>;
exports.hasRoutingConfig = hasRoutingConfig;
exports.hasActiveSubWikiRouting = hasActiveSubWikiRouting;
exports.isWikiWorkspaceWithRouting = isWikiWorkspaceWithRouting;
exports.workspaceSorter = workspaceSorter;
exports.matchesDirectTag = matchesDirectTag;
exports.getDirectTagMatch = getDirectTagMatch;
exports.findTagTreePath = findTagTreePath;
exports.matchesTagTree = matchesTagTree;
exports.matchesCustomFilter = matchesCustomFilter;
exports.getMatchedCustomFilter = getMatchedCustomFilter;
exports.explainTiddlerRouting = explainTiddlerRouting;
exports.matchTiddlerToWorkspace = matchTiddlerToWorkspace;
exports.buildTiddlerRoutingInfo = buildTiddlerRoutingInfo;
