import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import { workspaceSorter } from '@services/workspaces/utilities';

/**
 * Sub-wiki routing utilities for matching tiddlers/files to workspaces.
 * These utilities are exposed as $tw.utils functions for use in plugins.
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
 * Check if a workspace is a wiki workspace with routing configuration.
 * This filters to wiki workspaces that are either the main workspace or sub-wikis of it.
 */
function isWikiWorkspaceWithRouting(
  workspaceItem: IWorkspace,
  mainWorkspaceId: string,
): workspaceItem is IWikiWorkspace {
  // Must have wiki folder location
  if (!('wikiFolderLocation' in workspaceItem) || !workspaceItem.wikiFolderLocation) {
    return false;
  }

  // Must have routing config
  if (!hasRoutingConfig(workspaceItem)) {
    return false;
  }

  // Include if it's the main workspace
  const isMain = workspaceItem.id === mainWorkspaceId;

  // Include if it's a sub-wiki of the current main workspace
  const isSubWiki = 'isSubWiki' in workspaceItem &&
    workspaceItem.isSubWiki &&
    'mainWikiID' in workspaceItem &&
    workspaceItem.mainWikiID === mainWorkspaceId;

  return isMain || isSubWiki;
}

/**
 * Check if a tiddler matches a workspace's direct tag routing.
 * Returns true if:
 * - Any of the tiddler's tags match any of the workspace's tagNames
 * - The tiddler's title IS one of the tagNames (it's a "tag tiddler")
 */
function matchesDirectTag(
  tiddlerTitle: string,
  tiddlerTags: string[],
  workspaceTagNames: string[],
): boolean {
  if (workspaceTagNames.length === 0) {
    return false;
  }

  const hasMatchingTag = workspaceTagNames.some(tagName => tiddlerTags.includes(tagName));
  const isTitleATagName = workspaceTagNames.includes(tiddlerTitle);

  return hasMatchingTag || isTitleATagName;
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
  const filters = filterExpression.split('\n').map(f => f.trim()).filter(f => f.length > 0);

  for (const filter of filters) {
    const result = wiki.filterTiddlers(filter, undefined, wiki.makeTiddlerIterator([tiddlerTitle]));
    if (result.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Match a tiddler to a workspace based on routing rules.
 * Checks workspaces in order (priority) and returns the first match.
 *
 * For each workspace, checks in order (any match wins):
 * 1. Direct tag match (including if tiddler's title IS one of the tagNames)
 * 2. If includeTagTree is enabled, use in-tagtree-of filter for recursive tag matching
 * 3. If fileSystemPathFilterEnable is enabled, use custom filter expressions
 */
function matchTiddlerToWorkspace(
  tiddlerTitle: string,
  tiddlerTags: string[],
  workspacesWithRouting: IWikiWorkspace[],
  wiki: typeof $tw.wiki,
  rootWidget: typeof $tw.rootWidget,
): IWikiWorkspace | undefined {
  for (const workspace of workspacesWithRouting) {
    // 1. Direct tag match
    if (matchesDirectTag(tiddlerTitle, tiddlerTags, workspace.tagNames)) {
      return workspace;
    }

    // 2. Tag tree match (if enabled)
    if (workspace.includeTagTree && workspace.tagNames.length > 0) {
      if (matchesTagTree(tiddlerTitle, workspace.tagNames, wiki, rootWidget)) {
        return workspace;
      }
    }

    // 3. Custom filter match (if enabled)
    if (workspace.fileSystemPathFilterEnable && workspace.fileSystemPathFilter) {
      if (matchesCustomFilter(tiddlerTitle, workspace.fileSystemPathFilter, wiki)) {
        return workspace;
      }
    }
  }

  return undefined;
}

declare const exports: Record<string, unknown>;
exports.hasRoutingConfig = hasRoutingConfig;
exports.isWikiWorkspaceWithRouting = isWikiWorkspaceWithRouting;
exports.workspaceSorter = workspaceSorter;
exports.matchesDirectTag = matchesDirectTag;
exports.matchesTagTree = matchesTagTree;
exports.matchesCustomFilter = matchesCustomFilter;
exports.matchTiddlerToWorkspace = matchTiddlerToWorkspace;
