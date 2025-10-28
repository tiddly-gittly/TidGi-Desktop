import { Then, When } from '@cucumber/cucumber';
import fs from 'fs-extra';
import path from 'path';
import type { IWorkspace } from '../../src/services/workspaces/interface';
import { settingsPath, wikiTestRootPath, wikiTestWikiPath } from '../supports/paths';
import type { ApplicationWorld } from './application';

/**
 * Generic function to wait for a log marker to appear in wiki log files.
 */
async function waitForLogMarker(searchString: string, errorMessage: string, maxWaitMs = 10000): Promise<void> {
  const logPath = path.join(process.cwd(), 'userData-test', 'logs');
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const files = await fs.readdir(logPath);
      const wikiLogFiles = files.filter(f => f.startsWith('wiki-') && f.endsWith('.log'));

      for (const file of wikiLogFiles) {
        const content = await fs.readFile(path.join(logPath, file), 'utf-8');
        if (content.includes(searchString)) {
          return;
        }
      }
    } catch {
      // Log directory might not exist yet, continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(errorMessage);
}

/**
 * Wait for both SSE and watch-fs to be ready and stabilized.
 * This combines the checks for test-id-SSE_READY and test-id-WATCH_FS_STABILIZED markers.
 */
async function waitForSSEAndWatchFsReady(maxWaitMs = 15000): Promise<void> {
  const logPath = path.join(process.cwd(), 'userData-test', 'logs');
  const startTime = Date.now();
  let sseReady = false;
  let watchFsStabilized = false;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const files = await fs.readdir(logPath);
      const wikiLogFiles = files.filter(f => f.startsWith('wiki-') && f.endsWith('.log'));

      for (const file of wikiLogFiles) {
        const content = await fs.readFile(path.join(logPath, file), 'utf-8');
        if (content.includes('[test-id-SSE_READY]')) {
          sseReady = true;
        }
        if (content.includes('[test-id-WATCH_FS_STABILIZED]')) {
          watchFsStabilized = true;
        }
      }

      if (sseReady && watchFsStabilized) {
        return;
      }
    } catch {
      // Log directory might not exist yet, continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const missingServices = [];
  if (!sseReady) missingServices.push('SSE');
  if (!watchFsStabilized) missingServices.push('watch-fs');
  throw new Error(`${missingServices.join(' and ')} did not become ready within timeout`);
}

/**
 * Wait for a tiddler to be added by watch-fs.
 */
async function waitForTiddlerAdded(tiddlerTitle: string, maxWaitMs = 10000): Promise<void> {
  await waitForLogMarker(
    `[test-id-WATCH_FS_TIDDLER_ADDED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not added within timeout`,
    maxWaitMs,
  );
}

/**
 * Wait for a tiddler to be updated by watch-fs.
 */
async function waitForTiddlerUpdated(tiddlerTitle: string, maxWaitMs = 10000): Promise<void> {
  await waitForLogMarker(
    `[test-id-WATCH_FS_TIDDLER_UPDATED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not updated within timeout`,
    maxWaitMs,
  );
}

/**
 * Wait for frontend SSE to receive modification event for a tiddler.
 */
async function waitForSSEFrontendReceivedModification(tiddlerTitle: string, maxWaitMs = 10000): Promise<void> {
  await waitForLogMarker(
    `[test-id-SSE_FRONTEND_RECEIVED_MODIFICATION] ${tiddlerTitle}`,
    `Frontend SSE did not receive modification event for "${tiddlerTitle}" within timeout`,
    maxWaitMs,
  );
}

/**
 * Wait for a tiddler to be deleted by watch-fs.
 */
async function waitForTiddlerDeleted(tiddlerTitle: string, maxWaitMs = 10000): Promise<void> {
  await waitForLogMarker(
    `[test-id-WATCH_FS_TIDDLER_DELETED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not deleted within timeout`,
    maxWaitMs,
  );
}

When('I cleanup test wiki so it could create a new one on start', async function() {
  if (fs.existsSync(wikiTestWikiPath)) fs.removeSync(wikiTestWikiPath);

  /**
   * Clean up wiki log files to prevent reading stale logs from previous scenarios.
   * This is critical for tests that wait for log markers like [test-id-WATCH_FS_STABILIZED],
   * as Node.js file system caching can cause tests to read old log content.
   */
  const logDirectory = path.join(process.cwd(), 'userData-test', 'logs');
  if (fs.existsSync(logDirectory)) {
    const logFiles = fs.readdirSync(logDirectory).filter(f => f.startsWith('wiki-') && f.endsWith('.log'));
    for (const logFile of logFiles) {
      fs.removeSync(path.join(logDirectory, logFile));
    }
  }

  type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
  if (!fs.existsSync(settingsPath)) return;
  const settings = fs.readJsonSync(settingsPath) as SettingsFile;
  const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};
  const filtered: Record<string, IWorkspace> = {};
  for (const id of Object.keys(workspaces)) {
    const ws = workspaces[id];
    const name = ws.name;
    if (name === 'wiki' || id === 'wiki') continue;
    filtered[id] = ws;
  }
  fs.writeJsonSync(settingsPath, { ...settings, workspaces: filtered }, { spaces: 2 });
});

/**
 * Verify file exists in directory
 */
Then('file {string} should exist in {string}', { timeout: 15000 }, async function(this: ApplicationWorld, fileName: string, directoryPath: string) {
  // Replace {tmpDir} with wiki test root (not wiki subfolder)
  const actualPath = directoryPath.replace('{tmpDir}', wikiTestRootPath);
  const filePath = path.join(actualPath, fileName);

  let exists = false;
  for (let index = 0; index < 20; index++) {
    if (await fs.pathExists(filePath)) {
      exists = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!exists) {
    throw new Error(`File "${fileName}" not found in directory: ${actualPath}`);
  }
});

/**
 * Cleanup function for sub-wiki routing test
 * Removes test workspaces created during the test
 */
function clearSubWikiRoutingTestData() {
  if (!fs.existsSync(settingsPath)) return;

  type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
  const settings = fs.readJsonSync(settingsPath) as SettingsFile;
  const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};
  const filtered: Record<string, IWorkspace> = {};

  // Remove test workspaces (SubWiki, etc from sub-wiki routing tests)
  for (const id of Object.keys(workspaces)) {
    const ws = workspaces[id];
    const name = ws.name;
    // Keep workspaces that don't match test patterns
    if (name !== 'SubWiki') {
      filtered[id] = ws;
    }
  }

  fs.writeJsonSync(settingsPath, { ...settings, workspaces: filtered }, { spaces: 2 });

  // Remove test wiki folders from filesystem
  const testFolders = ['SubWiki'];
  for (const folder of testFolders) {
    const wikiPath = path.join(wikiTestWikiPath, folder);
    if (fs.existsSync(wikiPath)) {
      fs.removeSync(wikiPath);
    }
  }
}

Then('I wait for SSE and watch-fs to be ready', { timeout: 20000 }, async function(this: ApplicationWorld) {
  try {
    await waitForSSEAndWatchFsReady();
  } catch (error) {
    throw new Error(`Failed to wait for SSE and watch-fs: ${(error as Error).message}`);
  }
});

Then('I wait for tiddler {string} to be added by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  try {
    await waitForTiddlerAdded(tiddlerTitle);
  } catch (error) {
    throw new Error(`Failed to wait for tiddler "${tiddlerTitle}" to be added: ${(error as Error).message}`);
  }
});

Then('I wait for tiddler {string} to be updated by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  try {
    await waitForTiddlerUpdated(tiddlerTitle);
  } catch (error) {
    throw new Error(`Failed to wait for tiddler "${tiddlerTitle}" to be updated: ${(error as Error).message}`);
  }
});

Then('I wait for tiddler {string} to be deleted by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  try {
    await waitForTiddlerDeleted(tiddlerTitle);
  } catch (error) {
    throw new Error(`Failed to wait for tiddler "${tiddlerTitle}" to be deleted: ${(error as Error).message}`);
  }
});

Then('I wait for frontend SSE to receive modification for {string}', async function(this: ApplicationWorld, tiddlerTitle: string) {
  try {
    await waitForSSEFrontendReceivedModification(tiddlerTitle);
  } catch (error) {
    throw new Error(`Failed to wait for frontend SSE to receive modification for "${tiddlerTitle}": ${(error as Error).message}`);
  }
});

// File manipulation step definitions

When('I create file {string} with content:', async function(this: ApplicationWorld, filePath: string, content: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualPath = filePath.replace('{tmpDir}', wikiTestRootPath);

  // Ensure directory exists
  await fs.ensureDir(path.dirname(actualPath));

  // Write the file with the provided content
  await fs.writeFile(actualPath, content, 'utf-8');
});

When('I modify file {string} to contain {string}', async function(this: ApplicationWorld, filePath: string, content: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualPath = filePath.replace('{tmpDir}', wikiTestRootPath);

  // Read the existing file
  let fileContent = await fs.readFile(actualPath, 'utf-8');

  // TiddlyWiki .tid files have a format: headers followed by blank line and text
  // We need to preserve headers and only modify the text part
  const lines = fileContent.split('\n');
  const blankLineIndex = lines.findIndex(line => line.trim() === '');

  if (blankLineIndex >= 0) {
    // Keep headers, replace text after blank line
    const headers = lines.slice(0, blankLineIndex + 1);
    fileContent = [...headers, content].join('\n');
  } else {
    // No headers found or file only have headers, append content
    fileContent = `${fileContent}\n\n${content}`;
  }

  // Write the modified content back
  await fs.writeFile(actualPath, fileContent, 'utf-8');
});

When('I modify file {string} to contain:', async function(this: ApplicationWorld, filePath: string, content: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualPath = filePath.replace('{tmpDir}', wikiTestRootPath);

  // For multi-line content with headers, just write the content directly
  // (assumes the content includes all headers and structure)
  await fs.writeFile(actualPath, content, 'utf-8');
});

When('I delete file {string}', async function(this: ApplicationWorld, filePath: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualPath = filePath.replace('{tmpDir}', wikiTestRootPath);

  // Delete the file
  await fs.remove(actualPath);
});

When('I rename file {string} to {string}', async function(this: ApplicationWorld, oldPath: string, newPath: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualOldPath = oldPath.replace('{tmpDir}', wikiTestRootPath);
  const actualNewPath = newPath.replace('{tmpDir}', wikiTestRootPath);

  // Ensure the target directory exists
  await fs.ensureDir(path.dirname(actualNewPath));

  // Rename/move the file
  await fs.rename(actualOldPath, actualNewPath);
});

When('I modify file {string} to add field {string}', async function(this: ApplicationWorld, filePath: string, fieldLine: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualPath = filePath.replace('{tmpDir}', wikiTestRootPath);

  // Read the existing file
  const fileContent = await fs.readFile(actualPath, 'utf-8');

  // TiddlyWiki .tid files have headers followed by a blank line and text
  // We need to add the field to the headers section
  const lines = fileContent.split('\n');
  const blankLineIndex = lines.findIndex(line => line.trim() === '');

  if (blankLineIndex >= 0) {
    // Insert the new field before the blank line
    lines.splice(blankLineIndex, 0, fieldLine);
  } else {
    // No blank line found, add to the beginning
    lines.unshift(fieldLine);
  }

  // Write the modified content back
  await fs.writeFile(actualPath, lines.join('\n'), 'utf-8');
});

export { clearSubWikiRoutingTestData };
