import { isLinux, isMac, isWin } from '@/helpers/system';
import { logger } from '@services/libs/log';
import { getAvailableEditors as getAvailableEditorsDarwin, getAvailableGitGUIApps as getAvailableGitGUIAppsDarwin } from './darwin';
import { IFoundEditor } from './found-editor';
import { getAvailableEditors as getAvailableEditorsLinux, getAvailableGitGUIApps as getAvailableGitGUIAppsLinux } from './linux';
import { ExternalEditorError } from './shared';
import { getAvailableEditors as getAvailableEditorsWindows, getAvailableGitGUIApps as getAvailableGitGUIAppsWindows } from './win32';

let editorCache: ReadonlyArray<IFoundEditor<string>> | undefined;
let gitGUIAppCache: ReadonlyArray<IFoundEditor<string>> | undefined;
/** sometimes we only search for one editor, so cache is not the full list */
let didFullSearch = false;

/**
 * Resolve a list of installed editors on the user's machine, using the known
 * install identifiers that each OS supports.
 */
export async function getAvailableEditors(editorName?: string): Promise<ReadonlyArray<IFoundEditor<string>>> {
  // if we have cache, try cache first
  if (editorCache !== undefined && editorCache.length > 0) {
    if (editorName !== undefined && editorCache.some((item) => item.editor === editorName)) {
      return editorCache;
    }
    // if we are asking for a full list (editorName === undefined), we try return the full cache
    if (didFullSearch) {
      return editorCache;
    }
  }

  if (editorName === undefined) {
    didFullSearch = true;
  }

  if (isMac) {
    const editorResult = await getAvailableEditorsDarwin(editorName);
    if (editorName === undefined) {
      editorCache = editorResult;
    }
    return editorResult;
  }

  if (isWin) {
    const editorResult = await getAvailableEditorsWindows(editorName);
    if (editorName === undefined) {
      editorCache = editorResult;
    }
    return editorResult;
  }

  if (isLinux) {
    const editorResult = await getAvailableEditorsLinux(editorName);
    if (editorName === undefined) {
      editorCache = editorResult;
    }
    return editorResult;
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
export async function findEditorOrDefault(editorName?: string): Promise<IFoundEditor<string> | undefined> {
  const editors = await getAvailableEditors(editorName);
  if (editors.length === 0) {
    return;
  }

  if (editorName !== undefined) {
    const match = editors.find((p) => p.editor === editorName);
    if (match === undefined) {
      const menuItemName = isMac ? 'Preferences' : 'Options';
      const message = `The editor '${editorName}' could not be found. Please open ${menuItemName} and choose an available editor.`;

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

  if (isMac) {
    gitGUIAppCache = await getAvailableGitGUIAppsDarwin();
    return gitGUIAppCache;
  }

  if (isWin) {
    gitGUIAppCache = await getAvailableGitGUIAppsWindows();
    return gitGUIAppCache;
  }

  if (isLinux) {
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
      const menuItemName = isMac ? 'Preferences' : 'Options';
      const message = `The gitGUIApp '${name}' could not be found. Please open ${menuItemName} and choose an available gitGUIApp.`;

      throw new ExternalEditorError(message, { openPreferences: true });
    }

    return match;
  }

  return gitGUIApps[0];
}
