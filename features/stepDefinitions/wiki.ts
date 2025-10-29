import { Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import fs from 'fs-extra';
import path from 'path';
import type { IWorkspace } from '../../src/services/workspaces/interface';
import { settingsPath, wikiTestRootPath, wikiTestWikiPath } from '../supports/paths';
import type { ApplicationWorld } from './application';

// Backoff configuration for retries
const BACKOFF_OPTIONS = {
  numOfAttempts: 3,
  startingDelay: 200,
  timeMultiple: 1.5,
};

/**
 * Generic function to wait for a log marker to appear in wiki log files.
 */
async function waitForLogMarker(searchString: string, errorMessage: string, maxWaitMs = 10000): Promise<void> {
  const logPath = path.join(process.cwd(), 'userData-test', 'logs');

  await backOff(
    async () => {
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
        // Log directory might not exist yet, continue retrying
      }

      throw new Error('Log marker not found yet');
    },
    {
      numOfAttempts: Math.ceil(maxWaitMs / 100),
      startingDelay: 100,
      timeMultiple: 1,
      maxDelay: 100,
      delayFirstAttempt: false,
      jitter: 'none',
    },
  ).catch(() => {
    throw new Error(errorMessage);
  });
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
 * Helper function to get directory tree structure
 */
async function getDirectoryTree(directory: string, prefix = '', maxDepth = 3, currentDepth = 0): Promise<string> {
  if (currentDepth >= maxDepth || !(await fs.pathExists(directory))) {
    return '';
  }

  let tree = '';
  try {
    const items = await fs.readdir(directory);
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const isLast = index === items.length - 1;
      const itemPath = path.join(directory, item);
      const connector = isLast ? '└── ' : '├── ';

      try {
        const stat = await fs.stat(itemPath);
        tree += `${prefix}${connector}${item}${stat.isDirectory() ? '/' : ''}\n`;

        if (stat.isDirectory()) {
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          tree += await getDirectoryTree(itemPath, newPrefix, maxDepth, currentDepth + 1);
        }
      } catch {
        tree += `${prefix}${connector}${item} [error reading]\n`;
      }
    }
  } catch {
    // Directory not readable
  }

  return tree;
}

/**
 * Verify file exists in directory
 */
Then('file {string} should exist in {string}', { timeout: 15000 }, async function(this: ApplicationWorld, fileName: string, directoryPath: string) {
  // Replace {tmpDir} with wiki test root (not wiki subfolder)
  let actualPath = directoryPath.replace('{tmpDir}', wikiTestRootPath);

  // Resolve symlinks on all platforms to handle sub-wikis correctly
  // On Linux, symlinks might point to the real path, so we need to follow them
  if (await fs.pathExists(actualPath)) {
    try {
      actualPath = fs.realpathSync(actualPath);
    } catch {
      // If realpathSync fails, continue with the original path
    }
  }

  const filePath = path.join(actualPath, fileName);

  try {
    await backOff(
      async () => {
        if (await fs.pathExists(filePath)) {
          return;
        }
        throw new Error('File not found yet');
      },
      BACKOFF_OPTIONS,
    );
  } catch {
    // Get two levels up from actualPath
    const twoLevelsUp = path.resolve(actualPath, '..', '..');
    const tree = await getDirectoryTree(twoLevelsUp);

    // Also read all .tid files in the actualPath directory
    let tidFilesContent = '';
    try {
      if (await fs.pathExists(actualPath)) {
        const files = await fs.readdir(actualPath);
        const tidFiles = files.filter(f => f.endsWith('.tid'));

        if (tidFiles.length > 0) {
          tidFilesContent = '\n\n.tid files in directory:\n';
          for (const tidFile of tidFiles) {
            const tidPath = path.join(actualPath, tidFile);
            const content = await fs.readFile(tidPath, 'utf-8');
            tidFilesContent += `\n=== ${tidFile} ===\n${content}\n`;
          }
        }
      }
    } catch (readError) {
      tidFilesContent = `\n\nError reading .tid files: ${String(readError)}`;
    }

    throw new Error(
      `File "${fileName}" not found in directory: ${actualPath}\n\n` +
        `Directory tree (2 levels up from ${twoLevelsUp}):\n${tree}${tidFilesContent}`,
    );
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

Then('I wait for SSE and watch-fs to be ready', async function(this: ApplicationWorld) {
  await waitForLogMarker('[test-id-WATCH_FS_STABILIZED]', 'watch-fs did not become ready within timeout', 15000);
  await waitForLogMarker('[test-id-SSE_READY]', 'SSE backend did not become ready within timeout', 15000);
});

Then('I wait for tiddler {string} to be added by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  await waitForLogMarker(
    `[test-id-WATCH_FS_TIDDLER_ADDED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not added within timeout`,
  );
});

Then('I wait for tiddler {string} to be updated by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  await waitForLogMarker(
    `[test-id-WATCH_FS_TIDDLER_UPDATED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not updated within timeout`,
  );
});

Then('I wait for tiddler {string} to be deleted by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  await waitForLogMarker(
    `[test-id-WATCH_FS_TIDDLER_DELETED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not deleted within timeout`,
  );
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
  // Split by both \n and \r\n to handle different line endings
  const lines = fileContent.split(/\r?\n/);

  const blankLineIndex = lines.findIndex(line => line.trim() === '');

  if (blankLineIndex >= 0) {
    // File has headers and content separated by blank line
    // Keep headers, replace text after blank line
    const headers = lines.slice(0, blankLineIndex + 1);

    // Note: We intentionally do NOT update the modified field here
    // This simulates a real user editing the file in an external editor,
    // where the modified field would not be automatically updated
    // The echo prevention mechanism should detect this as a real external change
    // because the content changed but the modified timestamp stayed the same

    fileContent = [...headers, content].join('\n');
  } else {
    // File has only headers, no content yet (no blank line separator)
    // We need to add the blank line separator and the content
    // Again, we don't modify the modified field
    fileContent = [...lines, '', content].join('\n');
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
