/**
 * Workspace content kind: folder-based Node.js wiki vs single-file HTML wiki.
 */
export enum WorkspaceType {
  folder = 'folder',
  html = 'html',
}

export const htmlWorkspaceLocalOnlyFields = ['htmlFileLocation', 'workspaceType'] as const;
