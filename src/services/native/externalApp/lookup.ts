import { ExternalEditorError } from './shared';
import { IFoundEditor } from './found-editor';
import { getAvailableEditors as getAvailableEditorsDarwin, getAvailableGitGUIApps as getAvailableGitGUIAppsDarwin } from './darwin';
import { getAvailableEditors as getAvailableEditorsWindows, getAvailableGitGUIApps as getAvailableGitGUIAppsWindows } from './win32';
import { getAvailableEditors as getAvailableEditorsLinux, getAvailableGitGUIApps as getAvailableGitGUIAppsLinux } from './linux';
import { logger } from '@services/libs/log';

let editorCache: ReadonlyArray<IFoundEditor<string>> | undefined;
let gitGUIAppCache: ReadonlyArray<IFoundEditor<string>> | undefined;

/**
 * Resolve a list of installed editors on the user's machine, using the known
 * install identifiers that each OS supports.
 */
export async function getAvailableEditors(): Promise<ReadonlyArray<IFoundEditor<string>>> {
  if (editorCache !== undefined && editorCache.length > 0) {
    return editorCache;
  }

  if (process.platform === 'darwin') {
    editorCache = await getAvailableEditorsDarwin();
    return editorCache;
  }

  if (process.platform === 'win32') {
    editorCache = await getAvailableEditorsWindows();
    return editorCache;
  }

  if (process.platform === 'linux') {
    editorCache = await getAvailableEditorsLinux();
    return editorCache;
  }

  logger.warn(`Platform not currently supported for resolving editors: ${process.platform}`);

  return [];
}

/**
 * Find an editor installed on the machine using the friendly name, or the
 * first valid editor if `undefined` is provided.
 *
 * Will throw an error if no editors are found, or if the editor name cannot
 * be found (i.e. it has been removed).
 */
export async function findEditorOrDefault(name?: string): Promise<IFoundEditor<string> | undefined> {
  const editors = await getAvailableEditors();
  if (editors.length === 0) {
    return;
  }

  if (name !== undefined) {
    const match = editors.find((p) => p.editor === name);
    if (match === undefined) {
      const menuItemName = process.platform === 'darwin' ? 'Preferences' : 'Options';
      const message = `The editor '${name}' could not be found. Please open ${menuItemName} and choose an available editor.`;

      throw new ExternalEditorError(message, { openPreferences: true });
    }

    return match;
  }

  return editors[0];
}

/**
 * Resolve a list of installed git GUI app on the user's machine, using the known
 * install identifiers that each OS supports.
 */
export async function getAvailableGitGUIApps(): Promise<ReadonlyArray<IFoundEditor<string>>> {
  if (gitGUIAppCache !== undefined && gitGUIAppCache.length > 0) {
    return gitGUIAppCache;
  }

  if (process.platform === 'darwin') {
    gitGUIAppCache = await getAvailableGitGUIAppsDarwin();
    return gitGUIAppCache;
  }

  if (process.platform === 'win32') {
    gitGUIAppCache = await getAvailableGitGUIAppsWindows();
    return gitGUIAppCache;
  }

  if (process.platform === 'linux') {
    gitGUIAppCache = await getAvailableGitGUIAppsLinux();
    return gitGUIAppCache;
  }

  logger.warn(`Platform not currently supported for resolving gitGUIApps: ${process.platform}`);

  return [];
}

/**
 * Find an git GUI app installed on the machine using the friendly name, or the
 * first valid git GUI app if `undefined` is provided.
 *
 * Will throw an error if no git GUI app are found, or if the editor name cannot
 * be found (i.e. it has been removed).
 */
export async function findGitGUIAppOrDefault(name?: string): Promise<IFoundEditor<string> | undefined> {
  const gitGUIApps = await getAvailableGitGUIApps();
  if (gitGUIApps.length === 0) {
    return;
  }

  if (name !== undefined) {
    const match = gitGUIApps.find((p) => p.editor === name);
    if (match === undefined) {
      const menuItemName = process.platform === 'darwin' ? 'Preferences' : 'Options';
      const message = `The gitGUIApp '${name}' could not be found. Please open ${menuItemName} and choose an available gitGUIApp.`;

      throw new ExternalEditorError(message, { openPreferences: true });
    }

    return match;
  }

  return gitGUIApps[0];
}
