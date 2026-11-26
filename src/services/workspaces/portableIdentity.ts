import { getDefaultTidGiUrl } from '@/constants/urls';
import path from 'path';
import { isWikiWorkspace, type IWorkspace } from './interface';

/**
 * Reconcile identities only after all available portable configs have been read.
 * Input keys identify local settings entries; their values contain the imported
 * portable IDs. Never publish a partially renamed graph or merge different folders.
 */
export function reconcilePortableIdentities(entries: Record<string, IWorkspace>): Record<string, IWorkspace> {
  const result: Record<string, IWorkspace> = Object.create(null) as Record<string, IWorkspace>;
  const identities = new Map(Object.entries(entries).map(([localID, workspace]) => [localID, workspace.id]));
  const folderKey = (folder: string): string => {
    const normalized = path.resolve(folder).normalize('NFC');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };

  for (const [localID, workspace] of Object.entries(entries)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(workspace.id)) throw new Error('Invalid portable workspace id');
    const existing = result[workspace.id];
    // Two different identities cannot trade names: parent references would be ambiguous.
    const occupant = entries[workspace.id];
    if (occupant !== undefined && occupant.id !== workspace.id) {
      throw new Error(`Conflicting portable workspace identity: ${workspace.id}`);
    }
    if (existing !== undefined) {
      if (
        !isWikiWorkspace(existing) || !isWikiWorkspace(workspace) ||
        folderKey(existing.wikiFolderLocation) !== folderKey(workspace.wikiFolderLocation) ||
        existing.workspaceType !== workspace.workspaceType
      ) {
        throw new Error(`Duplicate portable workspace id in different folders: ${workspace.id}`);
      }
      // Keep the first local entry's presentation settings and any active selection.
      result[workspace.id] = { ...existing, active: existing.active || workspace.active };
      continue;
    }
    if (!isWikiWorkspace(workspace)) {
      result[workspace.id] = { ...workspace };
      continue;
    }
    const changed = localID !== workspace.id;
    result[workspace.id] = {
      ...workspace,
      homeUrl: getDefaultTidGiUrl(workspace.id),
      lastUrl: changed ? null : workspace.lastUrl,
      lastNodeJSArgv: changed ? [] : workspace.lastNodeJSArgv,
    };
  }

  for (const workspace of Object.values(result)) {
    if (isWikiWorkspace(workspace) && workspace.mainWikiID) {
      workspace.mainWikiID = identities.get(workspace.mainWikiID) ?? workspace.mainWikiID;
    }
  }
  return result;
}
