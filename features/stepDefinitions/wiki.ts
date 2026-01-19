import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import { exec as gitExec } from 'dugite';
import { backOff } from 'exponential-backoff';
import fs from 'fs-extra';
import path from 'path';
import type { IWikiWorkspace, IWorkspace } from '../../src/services/workspaces/interface';
import { parseDataTableRows } from '../supports/dataTable';
import { getLogPath, getSettingsPath, getWikiTestRootPath, getWikiTestWikiPath } from '../supports/paths';
// Scenario-specific paths are computed via helper functions
import type { ApplicationWorld } from './application';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  CRITICAL WARNING FOR ALL AI AGENTS - READ THIS BEFORE ANY MODIFICATION ⚠️
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ABSOLUTE RULES - NO EXCEPTIONS:
 *
 * 1. NEVER INCREASE TIMEOUT VALUES! TIMEOUT = FAILURE = REAL BUG!
 * 2. MAXIMUM TIMEOUTS: Local 5s, CI 10s (exactly 2x, NO MORE)
 * 3. BEFORE MODIFYING: Read docs/Testing.md, find REAL BUG, fix APPLICATION
 * 4. THIS HAS BEEN VIOLATED 3 TIMES - DO NOT MAKE IT 4!
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Type guard for wiki workspace
function isWikiWorkspace(workspace: IWorkspace): workspace is IWikiWorkspace {
  return 'wikiFolderLocation' in workspace && workspace.wikiFolderLocation !== undefined;
}

// Backoff configuration for retries
const BACKOFF_OPTIONS = {
  numOfAttempts: 10,
  startingDelay: 200,
  timeMultiple: 1.5,
};

/**
 * Generic function to wait for a log marker to appear in wiki log files.
 *
 * ⚠️ IMPORTANT FOR AI AGENTS ⚠️
 * DO NOT increase timeout values to "fix" test failures!
 * Per Testing.md: "Timeout usually because of expected element not present."
 * Timeout means the expected condition was NEVER met - this indicates a REAL BUG in the code,
 * not a timing issue. Increasing timeouts only masks the underlying problem.
 *
 * If a test times out, you MUST:
 * 1. Read the test logs in test-artifacts/{scenarioSlug}/userData-test/logs/
 * 2. Find the REAL error (SQLite constraint, page load failure, missing element, etc.)
 * 3. Fix the actual code bug, not the test timeout
 *
 * Before attempting ANY timeout changes, RE-READ docs/Testing.md completely.
 *
 * You can add test-id for debugging, And remove unused test-id before you finish the work. Also remove test-id that interval is smaller than 2s.
 */
export async function waitForLogMarker(world: ApplicationWorld, searchString: string, errorMessage: string, maxWaitMs = 10000, logFilePattern = 'wiki-'): Promise<void> {
  const logPath = getLogPath(world);
  // Support multiple patterns separated by '|', and '*' for all log files
  const patterns = logFilePattern.split('|');
  const matchAll = patterns.includes('*');

  try {
    await backOff(
      async () => {
        try {
          const files = await fs.readdir(logPath);
          // Case-insensitive matching for log file patterns, or match all .log files if '*' is specified
          const logFiles = files.filter(f => {
            if (!f.endsWith('.log')) return false;
            if (matchAll) return true;
            return patterns.some(p => f.toLowerCase().startsWith(p.toLowerCase()));
          });

          for (const file of logFiles) {
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
      },
    );
  } catch {
    // If backOff fails, throw the user-friendly error message
    throw new Error(errorMessage);
  }
}

When('I cleanup test wiki so it could create a new one on start', async function(this: ApplicationWorld) {
  // Clean up main wiki folder
  if (fs.existsSync(getWikiTestWikiPath(this))) fs.removeSync(getWikiTestWikiPath(this));

  // Clean up all sub-wiki folders in wiki-test directory (SubWiki*, SubWikiPreload, SubWikiTagTree, SubWikiFilter, etc.)
  if (fs.existsSync(getWikiTestRootPath(this))) {
    const entries = fs.readdirSync(getWikiTestRootPath(this), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'wiki') {
        const subWikiPath = path.join(getWikiTestRootPath(this), entry.name);
        try {
          fs.removeSync(subWikiPath);
        } catch (error) {
          console.warn(`Failed to remove sub-wiki folder ${entry.name}:`, error);
        }
      }
    }
  }

  /**
   * Clean up log files to prevent reading stale logs from previous scenarios.
   * This is critical for tests that wait for log markers like [test-id-WATCH_FS_STABILIZED] or [test-id-git-commit-complete],
   * as Node.js file system caching can cause tests to read old log content.
   * Must clean both wiki- and TidGi- log files for git-related tests.
   */
  const logDirectory = getLogPath(this);
  if (fs.existsSync(logDirectory)) {
    const logFiles = fs.readdirSync(logDirectory).filter(f => (f.startsWith('wiki-') || f.startsWith('TidGi-')) && f.endsWith('.log'));
    for (const logFile of logFiles) {
      fs.removeSync(path.join(logDirectory, logFile));
    }
  }

  type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
  if (!fs.existsSync(getSettingsPath(this))) return;

  // Retry logic with exponential backoff for reading settings.json - it might be temporarily locked or corrupted
  let settings: SettingsFile;

  try {
    settings = await backOff(
      async () => {
        return fs.readJsonSync(getSettingsPath(this)) as SettingsFile;
      },
      {
        numOfAttempts: 3,
        startingDelay: 100,
        timeMultiple: 2,
        maxDelay: 500,
        retry: (error: Error, attemptNumber: number) => {
          console.warn(`Attempt ${attemptNumber}/3 failed to read settings.json:`, error);

          // If file is corrupted, don't retry - handle it in catch block
          if (error instanceof SyntaxError || error.message.includes('Unexpected end of JSON input')) {
            return false;
          }

          return true;
        },
      },
    );
  } catch (error) {
    // If file is corrupted or all retries failed, create empty settings
    console.warn('Settings file is corrupted or failed to read after retries, recreating with empty workspaces', error);
    settings = { workspaces: {} };
  }

  const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};
  const filtered: Record<string, IWorkspace> = {};
  for (const id of Object.keys(workspaces)) {
    const ws = workspaces[id];
    // Keep only page-type workspaces (agent, help, guide, add), remove all wiki workspaces
    // This includes main wiki and all sub-wikis
    if ('pageType' in ws && ws.pageType) {
      filtered[id] = ws;
    }
  }

  // Write with exponential backoff retry logic to handle file locks
  try {
    await backOff(
      async () => {
        fs.writeJsonSync(getSettingsPath(this), { ...settings, workspaces: filtered }, { spaces: 2 });
      },
      {
        numOfAttempts: 3,
        startingDelay: 100,
        timeMultiple: 2,
        maxDelay: 500,
        retry: (_error: Error, attemptNumber: number) => {
          console.warn(`Attempt ${attemptNumber}/3 failed to write settings.json:`, _error);
          return true;
        },
      },
    );
  } catch (error) {
    console.error('Failed to write settings.json after 3 attempts, continuing anyway', error);
  }
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
Then('file {string} should exist in {string}', async function(this: ApplicationWorld, fileName: string, simpleDirectoryPath: string) {
  // Replace {tmpDir} with wiki test root (not wiki subfolder)
  let directoryPath = simpleDirectoryPath.replace('{tmpDir}', getWikiTestRootPath(this));

  // If path doesn't contain {tmpDir} and doesn't start with test-artifacts,
  // treat it as relative to scenario-specific test-artifacts directory
  if (!simpleDirectoryPath.includes('{tmpDir}') && !simpleDirectoryPath.startsWith('test-artifacts')) {
    directoryPath = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug, simpleDirectoryPath);
  }

  // Resolve symlinks on all platforms to handle sub-wikis correctly
  // On Linux, symlinks might point to the real path, so we need to follow them
  if (await fs.pathExists(directoryPath)) {
    try {
      directoryPath = fs.realpathSync(directoryPath);
    } catch {
      // If realpathSync fails, continue with the original path
    }
  }

  const filePath = path.join(directoryPath, fileName);

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
    // Get 1 level up from actualPath
    const oneLevelsUp = path.resolve(directoryPath, '..');
    const tree = await getDirectoryTree(oneLevelsUp);

    // Also read all .tid files in the actualPath directory
    let tidFilesContent = '';
    try {
      if (await fs.pathExists(directoryPath)) {
        const files = await fs.readdir(directoryPath);
        const tidFiles = files.filter(f => f.endsWith('.tid'));

        if (tidFiles.length > 0) {
          tidFilesContent = '\n\n.tid files in directory:\n';
          for (const tidFile of tidFiles) {
            const tidPath = path.join(directoryPath, tidFile);
            const content = await fs.readFile(tidPath, 'utf-8');
            tidFilesContent += `\n=== ${tidFile} ===\n${content}\n`;
          }
        }
      }
    } catch (readError) {
      tidFilesContent = `\n\nError reading .tid files: ${String(readError)}`;
    }

    throw new Error(
      `File "${fileName}" not found in directory: ${directoryPath}\n\n` +
        `Directory tree (1 level up from ${oneLevelsUp}):\n${tree}${tidFilesContent}`,
    );
  }
});

Then('file {string} should not exist in {string}', { timeout: 15000 }, async function(this: ApplicationWorld, fileName: string, simpleDirectoryPath: string) {
  // Replace {tmpDir} with wiki test root (not wiki subfolder)
  let directoryPath = simpleDirectoryPath.replace('{tmpDir}', getWikiTestRootPath(this));

  // Resolve symlinks on all platforms to handle sub-wikis correctly
  if (await fs.pathExists(directoryPath)) {
    try {
      directoryPath = fs.realpathSync(directoryPath);
    } catch {
      // If realpathSync fails, continue with the original path
    }
  }

  const filePath = path.join(directoryPath, fileName);

  try {
    await backOff(
      async () => {
        if (!(await fs.pathExists(filePath))) {
          return;
        }
        throw new Error('File still exists');
      },
      BACKOFF_OPTIONS,
    );
  } catch {
    throw new Error(
      `File "${fileName}" should not exist but was found in directory: ${directoryPath}`,
    );
  }
});

/**
 * Verify that a workspace in settings.json has a specific property set to a specific value
 */
Then('settings.json should have workspace {string} with {string} set to {string}', { timeout: 10000 }, async function(
  this: ApplicationWorld,
  workspaceName: string,
  propertyName: string,
  expectedValue: string,
) {
  await backOff(
    async () => {
      if (!await fs.pathExists(getSettingsPath(this))) {
        throw new Error(`settings.json not found at ${getSettingsPath(this)}`);
      }

      type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
      const settings = await fs.readJson(getSettingsPath(this)) as SettingsFile;

      if (!settings.workspaces) {
        throw new Error('No workspaces found in settings.json');
      }

      // Find the workspace by name (check both settings.json and tidgi.config.json)
      let workspace: IWorkspace | undefined;
      for (const ws of Object.values(settings.workspaces)) {
        if (ws.name === workspaceName) {
          workspace = ws;
          break;
        }
        // Also check tidgi.config.json for wiki workspaces
        if (isWikiWorkspace(ws)) {
          try {
            const tidgiConfigPath = path.join(ws.wikiFolderLocation, 'tidgi.config.json');
            if (await fs.pathExists(tidgiConfigPath)) {
              const tidgiConfig = await fs.readJson(tidgiConfigPath) as { name?: string };
              if (tidgiConfig.name === workspaceName) {
                workspace = ws;
                break;
              }
            }
          } catch {
            // Ignore
          }
        }
      }
      if (!workspace) {
        throw new Error(`Workspace "${workspaceName}" not found in settings.json or tidgi.config.json`);
      }

      // Get the property value - check both settings.json and tidgi.config.json
      let actualValue = (workspace as unknown as Record<string, unknown>)[propertyName];

      // If not found in settings.json, check tidgi.config.json for wiki workspaces
      if (actualValue === undefined && isWikiWorkspace(workspace)) {
        try {
          const tidgiConfigPath = path.join(workspace.wikiFolderLocation, 'tidgi.config.json');
          if (await fs.pathExists(tidgiConfigPath)) {
            const tidgiConfig = await fs.readJson(tidgiConfigPath) as Record<string, unknown>;
            actualValue = tidgiConfig[propertyName];
          }
        } catch {
          // Ignore errors reading tidgi.config.json
        }
      }

      // Convert expected value to appropriate type for comparison
      let parsedExpectedValue: unknown = expectedValue;
      if (expectedValue === 'true') parsedExpectedValue = true;
      else if (expectedValue === 'false') parsedExpectedValue = false;
      else if (expectedValue === 'null') parsedExpectedValue = null;
      else if (!isNaN(Number(expectedValue))) parsedExpectedValue = Number(expectedValue);

      if (actualValue !== parsedExpectedValue) {
        throw new Error(`Expected "${propertyName}" to be "${expectedValue}" but got "${String(actualValue)}"`);
      }
    },
    BACKOFF_OPTIONS,
  );
});

/**
 * Verify that a workspace in settings.json has a property array that contains a specific value
 */
Then('settings.json should have workspace {string} with {string} containing {string}', { timeout: 10000 }, async function(
  this: ApplicationWorld,
  workspaceName: string,
  propertyName: string,
  expectedValue: string,
) {
  await backOff(
    async () => {
      if (!await fs.pathExists(getSettingsPath(this))) {
        throw new Error(`settings.json not found at ${getSettingsPath(this)}`);
      }

      type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
      const settings = await fs.readJson(getSettingsPath(this)) as SettingsFile;

      if (!settings.workspaces) {
        throw new Error('No workspaces found in settings.json');
      }

      // Find the workspace by name (check both settings.json and tidgi.config.json)
      let workspace: IWorkspace | undefined;
      for (const ws of Object.values(settings.workspaces)) {
        if (ws.name === workspaceName) {
          workspace = ws;
          break;
        }
        // Also check tidgi.config.json for wiki workspaces
        if (isWikiWorkspace(ws)) {
          try {
            const tidgiConfigPath = path.join(ws.wikiFolderLocation, 'tidgi.config.json');
            if (await fs.pathExists(tidgiConfigPath)) {
              const tidgiConfig = await fs.readJson(tidgiConfigPath) as { name?: string };
              if (tidgiConfig.name === workspaceName) {
                workspace = ws;
                break;
              }
            }
          } catch {
            // Ignore
          }
        }
      }
      if (!workspace) {
        throw new Error(`Workspace "${workspaceName}" not found in settings.json or tidgi.config.json`);
      }

      // Get the property value - check both settings.json and tidgi.config.json
      let actualValue = (workspace as unknown as Record<string, unknown>)[propertyName];

      // If not found in settings.json, check tidgi.config.json for wiki workspaces
      if (actualValue === undefined && isWikiWorkspace(workspace)) {
        try {
          const tidgiConfigPath = path.join(workspace.wikiFolderLocation, 'tidgi.config.json');
          if (await fs.pathExists(tidgiConfigPath)) {
            const tidgiConfig = await fs.readJson(tidgiConfigPath) as Record<string, unknown>;
            actualValue = tidgiConfig[propertyName];
          }
        } catch {
          // Ignore errors reading tidgi.config.json
        }
      }

      if (!Array.isArray(actualValue)) {
        throw new Error(`Expected "${propertyName}" to be an array but got "${typeof actualValue}"`);
      }

      if (!actualValue.includes(expectedValue)) {
        throw new Error(`Expected "${propertyName}" to contain "${expectedValue}" but got [${actualValue.join(', ')}]`);
      }
    },
    BACKOFF_OPTIONS,
  );
});

/**
 * Cleanup function for sub-wiki routing test
 * Removes test workspaces created during the test
 */
async function clearSubWikiRoutingTestData(scenarioRoot?: string) {
  const root = scenarioRoot || process.cwd();
  const settingsPath = path.resolve(root, 'userData-test', 'settings', 'settings.json');
  const wikiTestWikiPath = path.resolve(root, 'wiki-test');

  if (!(await fs.pathExists(settingsPath))) return;

  type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
  const settings = await fs.readJson(settingsPath) as SettingsFile;
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

  await fs.writeJson(settingsPath, { ...settings, workspaces: filtered }, { spaces: 2 });

  // Remove test wiki folders from filesystem
  const testFolders = ['SubWiki'];
  for (const folder of testFolders) {
    const wikiPath = path.join(wikiTestWikiPath, folder);
    if (await fs.pathExists(wikiPath)) {
      await fs.remove(wikiPath);
    }
  }
}

/**
 * Clear git test data to prevent state pollution between git tests
 * Removes the entire wiki folder - it will be recreated on next test start
 */
async function clearGitTestData(scenarioRoot?: string) {
  const root = scenarioRoot || process.cwd();
  const wikiPath = path.join(root, 'wiki-test', 'wiki');
  if (!(await fs.pathExists(wikiPath))) return;

  try {
    await fs.remove(wikiPath);
  } catch (error) {
    console.warn('Failed to remove wiki folder in git cleanup:', error);
  }
}

/**
/**
 * Generic step to wait for any log marker
 * @param description - Human-readable description of what we're waiting for (comes first for readability)
 * @param marker - The test-id marker to look for in logs
 *
 * This searches in all log files (TidGi-, wiki-, and any workspace-named logs)
 *
 * CRITICAL WARNING FOR ALL AI AGENTS:
 * DO NOT MODIFY TIMEOUT VALUES! NEVER!
 * If a test times out, it means there is a REAL BUG to fix, not a timeout to increase.
 * Timeout is a symptom, not the disease. Fix the root cause.
 * Read docs/Testing.md section "Key E2E Testing Patterns" point 6 before attempting any changes.
 * Maximum allowed timeouts: Local 5s, CI 10s (exactly 2x local, no more)
 */
Then('I wait for {string} log marker {string}', { timeout: process.env.CI ? 10 * 1000 : 5 * 1000 }, async function(this: ApplicationWorld, description: string, marker: string) {
  // Search in all log files using '*' pattern (includes TidGi-, wiki-, and workspace-named logs like WikiRenamed-)
  // Internal wait timeout: Local 3s, CI 6s (to fit within step timeout)
  const waitTimeout = process.env.CI ? 6000 : 3000;
  await waitForLogMarker(this, marker, `Log marker "${marker}" not found. Expected: ${description}`, waitTimeout, '*');
});

/**
 * Wait for multiple log markers in sequence using a DataTable
 * This is useful when you need to wait for several related log markers (e.g., after workspace restart)
 * Example usage:
 *   Then I wait for log markers:
 *     | description                      | marker                                   |
 *     | main wiki restarted              | [test-id-MAIN_WIKI_RESTARTED_AFTER_SUBWIKI] |
 *     | watch-fs stabilized after restart| [test-id-WATCH_FS_STABILIZED]            |
 *     | SSE ready after restart          | [test-id-SSE_READY]                      |
 */
Then('I wait for log markers:', { timeout: process.env.CI ? 10 * 1000 : 5 * 1000 }, async function(this: ApplicationWorld, dataTable: DataTable) {
  const rows = dataTable.raw();
  const dataRows = parseDataTableRows(rows, 2);

  if (dataRows[0]?.length !== 2) {
    throw new Error('Table must have exactly 2 columns: | description | marker |');
  }

  const waitTimeout = process.env.CI ? 6000 : 3000;
  const errors: string[] = [];

  // Wait for markers sequentially to maintain order
  for (const [description, marker] of dataRows) {
    try {
      await waitForLogMarker(this, marker, `Log marker "${marker}" not found. Expected: ${description}`, waitTimeout, '*');
    } catch (error) {
      errors.push(`Failed to find log marker "${marker}" (${description}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to wait for log markers:\n${errors.join('\n')}`);
  }
});

/**
 * Convenience step for waiting for SSE and watch-fs to be ready
 * This is commonly used in Background sections
 */
Then('I wait for SSE and watch-fs to be ready', async function(this: ApplicationWorld) {
  await waitForLogMarker(this, '[test-id-WATCH_FS_STABILIZED]', 'watch-fs did not become ready within timeout', 20000);
  await waitForLogMarker(this, '[test-id-SSE_READY]', 'SSE backend did not become ready within timeout', 20000);
});

/**
 * Remove log lines containing specific text from all log files (TidGi- and wiki- prefixed).
 * This is useful when you need to wait for a log marker that may have appeared earlier in the scenario,
 * and you want to ensure you're waiting for a new occurrence of that marker.
 * @param marker - The text pattern to remove from log files
 */
When('I clear log lines containing {string}', async function(this: ApplicationWorld, marker: string) {
  const logDirectory = getLogPath(this);
  if (!fs.existsSync(logDirectory)) return;

  // Clear from both TidGi- and wiki- prefixed log files
  const logFiles = fs.readdirSync(logDirectory).filter(f => (f.startsWith('TidGi-') || f.startsWith('wiki')) && f.endsWith('.log'));

  for (const logFile of logFiles) {
    const logPath = path.join(logDirectory, logFile);
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      // Remove lines containing the marker
      const filteredLines = content.split('\n').filter(line => !line.includes(marker));
      fs.writeFileSync(logPath, filteredLines.join('\n'), 'utf-8');
    } catch (error) {
      console.warn(`Failed to clear log lines from ${logFile}:`, error);
    }
  }
});

/**
 * Convenience steps for waiting for tiddler operations detected by watch-fs
 * These use dynamic markers that include the tiddler name
 */
Then('I wait for tiddler {string} to be added by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  await waitForLogMarker(
    this,
    `[test-id-WATCH_FS_TIDDLER_ADDED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not added within timeout`,
  );
});

Then('I wait for tiddler {string} to be updated by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  await waitForLogMarker(
    this,
    `[test-id-WATCH_FS_TIDDLER_UPDATED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not updated within timeout`,
  );
});

Then('I wait for tiddler {string} to be deleted by watch-fs', async function(this: ApplicationWorld, tiddlerTitle: string) {
  await waitForLogMarker(
    this,
    `[test-id-WATCH_FS_TIDDLER_DELETED] ${tiddlerTitle}`,
    `Tiddler "${tiddlerTitle}" was not deleted within timeout`,
  );
});

// File manipulation step definitions

When('I create file {string} with content:', async function(this: ApplicationWorld, filePath: string, content: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualPath = filePath.replace('{tmpDir}', getWikiTestRootPath(this));

  // Ensure directory exists
  await fs.ensureDir(path.dirname(actualPath));

  // Write the file with the provided content
  await fs.writeFile(actualPath, content, 'utf-8');
});

When('I modify file {string} to contain {string}', async function(this: ApplicationWorld, filePath: string, content: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  let actualPath = filePath.replace('{tmpDir}', getWikiTestRootPath(this));

  // If path doesn't contain {tmpDir} and is relative, resolve to scenario-specific directory
  if (!filePath.includes('{tmpDir}') && !path.isAbsolute(filePath)) {
    actualPath = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug, filePath);
  }

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
  let actualPath = filePath.replace('{tmpDir}', getWikiTestRootPath(this));

  // If path doesn't contain {tmpDir} and is relative, resolve to scenario-specific directory
  if (!filePath.includes('{tmpDir}') && !path.isAbsolute(filePath)) {
    actualPath = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug, filePath);
  }

  // For multi-line content with headers, just write the content directly
  // (assumes the content includes all headers and structure)
  await fs.writeFile(actualPath, content, 'utf-8');
});

When('I delete file {string}', async function(this: ApplicationWorld, filePath: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualPath = filePath.replace('{tmpDir}', getWikiTestRootPath(this));

  // Delete the file
  await fs.remove(actualPath);
});

When('I delete file {string} in {string}', async function(this: ApplicationWorld, fileName: string, simpleDirectoryPath: string) {
  // Replace {tmpDir} with wiki test root
  const directoryPath = simpleDirectoryPath.replace('{tmpDir}', getWikiTestRootPath(this));
  const filePath = path.join(directoryPath, fileName);

  // Delete the file
  await fs.remove(filePath);
});

When('I rename file {string} to {string}', async function(this: ApplicationWorld, oldPath: string, newPath: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualOldPath = oldPath.replace('{tmpDir}', getWikiTestRootPath(this));
  const actualNewPath = newPath.replace('{tmpDir}', getWikiTestRootPath(this));

  // Ensure the target directory exists
  await fs.ensureDir(path.dirname(actualNewPath));

  // Rename/move the file
  await fs.rename(actualOldPath, actualNewPath);
});

When('I modify file {string} to add field {string}', async function(this: ApplicationWorld, filePath: string, fieldLine: string) {
  // Replace {tmpDir} placeholder with actual temp directory
  const actualPath = filePath.replace('{tmpDir}', getWikiTestRootPath(this));

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

When('I open edit workspace window for workspace with name {string}', async function(this: ApplicationWorld, workspaceName: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  // Use backOff to retry finding the workspace, as tidgi.config.json might be written asynchronously
  let targetWorkspaceId: string | undefined;

  // Use extended backoff for workspace lookup as app may take time to sync settings
  const extendedBackoffOptions = {
    numOfAttempts: 15,
    startingDelay: 500,
    timeMultiple: 1.5,
  };

  await backOff(
    async () => {
      // Read settings file to get workspace info
      const settings = await fs.readJson(getSettingsPath(this)) as { workspaces?: Record<string, IWorkspace> };
      const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};

      // Find workspace by name or by wikiFolderLocation (in case name is removed from settings.json)
      for (const [id, workspace] of Object.entries(workspaces)) {
        if (workspace.pageType) continue; // Skip page workspaces

        // Try to match by name (if available in settings.json)
        if (workspace.name === workspaceName) {
          targetWorkspaceId = id;
          return;
        }

        // Try to read name from tidgi.config.json
        if (isWikiWorkspace(workspace)) {
          try {
            const tidgiConfigPath = path.join(workspace.wikiFolderLocation, 'tidgi.config.json');
            if (await fs.pathExists(tidgiConfigPath)) {
              const tidgiConfig = await fs.readJson(tidgiConfigPath) as { name?: string };
              if (tidgiConfig.name === workspaceName) {
                targetWorkspaceId = id;
                return;
              }
            }
          } catch {
            // Ignore errors reading tidgi.config.json
          }
        }
      }

      // If not found, throw error to trigger retry
      throw new Error(`Workspace "${workspaceName}" not found yet, will retry...`);
    },
    extendedBackoffOptions,
  );

  if (!targetWorkspaceId) {
    throw new Error(`No workspace found with name: ${workspaceName}`);
  }

  // Call window service through main window's webContents to open edit workspace window
  await this.app.evaluate(async ({ BrowserWindow }, workspaceId: string) => {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(win => !win.isDestroyed() && win.webContents && win.webContents.getURL().includes('index.html'));

    if (!mainWindow) {
      throw new Error('Main window not found');
    }

    // Call the window service to open edit workspace window
    // Safely pass workspaceId using JSON serialization to avoid string interpolation vulnerability
    await mainWindow.webContents.executeJavaScript(`
      (async () => {
        await window.service.window.open('editWorkspace', { workspaceID: ${JSON.stringify(workspaceId)} });
      })();
    `);
  }, targetWorkspaceId);

  // Wait for the edit workspace window to appear
  const success = await this.waitForWindowCondition(
    'editWorkspace',
    (window) => window !== undefined && !window.isClosed(),
  );

  if (!success) {
    throw new Error('Edit workspace window did not appear after opening');
  }
});

When('I create a new wiki workspace with name {string}', async function(this: ApplicationWorld, workspaceName: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  // Construct the full wiki path
  const wikiPath = path.join(getWikiTestRootPath(this), workspaceName);

  // Create the wiki folder using the template
  const templatePath = path.join(process.cwd(), 'template', 'wiki');
  await fs.copy(templatePath, wikiPath);

  // Remove the copied .git directory from the template to start fresh
  const gitPath = path.join(wikiPath, '.git');
  await fs.remove(gitPath).catch(() => {
    // Ignore if .git doesn't exist
  });

  // Initialize fresh git repository for the new wiki using dugite
  try {
    // Initialize git repository with master branch
    await gitExec(['init', '-b', 'master'], wikiPath);

    // Configure git user
    await gitExec(['config', 'user.email', 'test@tidgi.test'], wikiPath);
    await gitExec(['config', 'user.name', 'TidGi Test'], wikiPath);

    // Add all files and create initial commit
    await gitExec(['add', '.'], wikiPath);
    await gitExec(['commit', '-m', 'Initial commit'], wikiPath);
  } catch (error) {
    // Git initialization is not critical for the test, continue anyway
    console.log('Git initialization skipped:', (error as Error).message);
  }

  // Now create workspace configuration
  await this.app.evaluate(async ({ BrowserWindow }, { wikiName, wikiFullPath }: { wikiName: string; wikiFullPath: string }) => {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(win => !win.isDestroyed() && win.webContents && win.webContents.getURL().includes('index.html'));

    if (!mainWindow) {
      throw new Error('Main window not found');
    }

    // Call workspace service to create new workspace
    // Safely pass parameters using JSON serialization to avoid string interpolation vulnerability
    await mainWindow.webContents.executeJavaScript(`
      (async () => {
        await window.service.workspace.create({
          name: ${JSON.stringify(wikiName)},
          wikiFolderLocation: ${JSON.stringify(wikiFullPath)},
          isSubWiki: false,
          storageService: 'local',
        });
      })();
    `);
  }, { wikiName: workspaceName, wikiFullPath: wikiPath });

  // Wait for workspace to appear in UI
  await this.app.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
});

/**
 * Update workspace settings dynamically after app launch
 * This is useful for enabling features like enableFileSystemWatch in tests
 *
 * Usage:
 * When I update workspace "wiki" settings:
 *   | property                 | value |
 *   | enableFileSystemWatch    | true  |
 *   | syncOnInterval           | false |
 */
When('I update workspace {string} settings:', { timeout: 60000 }, async function(this: ApplicationWorld, workspaceName: string, dataTable: DataTable) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  // Parse settings from DataTable
  const rows = dataTable.hashes();
  const settingsUpdate: Record<string, unknown> = {};

  for (const row of rows) {
    const { property, value } = row;

    // Convert value to appropriate type
    let parsedValue: unknown = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (value === 'null') parsedValue = null;
    else if (!isNaN(Number(value))) parsedValue = Number(value);
    // Try to parse as JSON array
    else if (value.startsWith('[') && value.endsWith(']')) {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string if JSON parse fails
      }
    }

    settingsUpdate[property] = parsedValue;
  }

  // Read settings file to get workspace ID
  const settings = await fs.readJson(getSettingsPath(this)) as { workspaces?: Record<string, IWorkspace> };
  const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};

  // Find workspace by name or by wikiFolderLocation (in case name is removed from settings.json)
  let targetWorkspaceId: string | undefined;
  for (const [id, workspace] of Object.entries(workspaces)) {
    if (workspace.pageType) continue; // Skip page workspaces

    // Try to match by name (if available in settings.json)
    if (workspace.name === workspaceName) {
      targetWorkspaceId = id;
      break;
    }

    // Try to read name from tidgi.config.json
    if (isWikiWorkspace(workspace)) {
      try {
        const tidgiConfigPath = path.join(workspace.wikiFolderLocation, 'tidgi.config.json');
        if (await fs.pathExists(tidgiConfigPath)) {
          const tidgiConfig = await fs.readJson(tidgiConfigPath) as { name?: string };
          if (tidgiConfig.name === workspaceName) {
            targetWorkspaceId = id;
            break;
          }
        }
      } catch {
        // Ignore errors
      }
    }

    // Fallback: try to match by folder name in wikiFolderLocation
    if ('wikiFolderLocation' in workspace && workspace.wikiFolderLocation) {
      const folderName = path.basename(workspace.wikiFolderLocation);
      if (folderName === workspaceName) {
        targetWorkspaceId = id;
        break;
      }
    }
  }

  if (!targetWorkspaceId) {
    throw new Error(`No workspace found with name: ${workspaceName}`);
  }

  // Update workspace settings via main window
  await this.app.evaluate(async ({ BrowserWindow }, { workspaceId, updates }: { workspaceId: string; updates: Record<string, unknown> }) => {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(win => !win.isDestroyed() && win.webContents && win.webContents.getURL().includes('index.html'));

    if (!mainWindow) {
      throw new Error('Main window not found');
    }

    // Call workspace service to update workspace settings
    await mainWindow.webContents.executeJavaScript(`
      (async () => {
        await window.service.workspace.update(${JSON.stringify(workspaceId)}, ${JSON.stringify(updates)});
      })();
    `);
  }, { workspaceId: targetWorkspaceId, updates: settingsUpdate });

  // Wait for settings to propagate
  await this.app.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  // If enableFileSystemWatch was changed, we need to restart the wiki for it to take effect
  // The wiki worker reads this config at startup, so changes don't apply until restart
  if ('enableFileSystemWatch' in settingsUpdate) {
    // First, wait for the wiki to be fully started before attempting restart
    // This prevents conflicts if the wiki is still initializing
    // Wait for WATCH_FS since it indicates wiki worker is ready, or SSE_READY if watch is disabled
    try {
      await waitForLogMarker(this, '[test-id-WATCH_FS_STABILIZED]', 'watch-fs not ready before restart', 30000);
    } catch {
      // If watch-fs is disabled initially, wait for SSE instead
      await waitForLogMarker(this, '[test-id-SSE_READY]', 'SSE not ready before restart', 30000);
    }

    // Only clear watch-fs related log markers to ensure we wait for fresh ones after restart
    // Don't clear other markers like git-init-complete that won't appear again
    await clearLogLinesContaining(this, '[test-id-WATCH_FS_STABILIZED]');
    await clearLogLinesContaining(this, '[test-id-SSE_READY]');

    // Restart the wiki
    await this.app.evaluate(async ({ BrowserWindow }, workspaceId: string) => {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows.find(win => !win.isDestroyed() && win.webContents && win.webContents.getURL().includes('index.html'));

      if (!mainWindow) {
        throw new Error('Main window not found');
      }

      await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const workspace = await window.service.workspace.get(${JSON.stringify(workspaceId)});
          if (workspace) {
            await window.service.wiki.restartWiki(workspace);
          }
        })();
      `);
    }, targetWorkspaceId);

    // Wait for wiki to restart and watch-fs to stabilize
    // Only wait if enableFileSystemWatch was set to true
    if (settingsUpdate.enableFileSystemWatch === true) {
      await waitForLogMarker(this, '[test-id-WATCH_FS_STABILIZED]', 'watch-fs did not stabilize after restart', 30000);
    }
  }
});

/**
 * Clean up hibernation test data - remove wiki2 folder and its workspace config
 */
async function clearHibernationTestData(scenarioRoot?: string) {
  const root = scenarioRoot || process.cwd();
  const wikiTestRootPath = path.resolve(root, 'wiki-test');
  const settingsPath = path.resolve(root, 'userData-test', 'settings', 'settings.json');
  const wiki2Path = path.join(wikiTestRootPath, 'wiki2');

  // Remove wiki2 folder
  if (await fs.pathExists(wiki2Path)) {
    try {
      await fs.remove(wiki2Path);
    } catch (error) {
      console.warn('Failed to remove wiki2 folder in hibernation cleanup:', error);
    }
  }

  // Remove wiki2 workspace config from settings.json
  if (await fs.pathExists(settingsPath)) {
    try {
      type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
      const settings = await fs.readJson(settingsPath) as SettingsFile;
      if (settings.workspaces) {
        // Find and remove wiki2 workspace by folder location
        const wiki2WorkspaceId = Object.keys(settings.workspaces).find(id => {
          const workspace = settings.workspaces?.[id];
          return workspace && 'wikiFolderLocation' in workspace && workspace.wikiFolderLocation === wiki2Path;
        });

        if (wiki2WorkspaceId && settings.workspaces) {
          delete settings.workspaces[wiki2WorkspaceId];
          await fs.writeJson(settingsPath, settings, { spaces: 2 });
        }
      }
    } catch (error) {
      console.warn('Failed to remove wiki2 workspace config in hibernation cleanup:', error);
    }
  }
}

/**
 * Setup a sub-wiki with optional settings and multiple pre-existing tiddlers.
 * This creates the sub-wiki folder, tiddler files, and settings configuration
 * so the app loads everything on first startup.
 *
 * @param subWikiName - Name of the sub-wiki folder
 * @param tagName - Tag name for the sub-wiki routing
 * @param options - Optional settings: includeTagTree, fileSystemPathFilter
 * @param tiddlers - Array of {title, tags, content} objects from DataTable.hashes()
 */
async function setupSubWiki(
  scenarioSlug: string,
  subWikiName: string,
  tagName: string,
  options: {
    includeTagTree?: boolean;
    fileSystemPathFilter?: string;
  },
  tiddlers: Record<string, string>[],
) {
  const wikiTestRootPath = path.resolve(process.cwd(), 'test-artifacts', scenarioSlug, 'wiki-test');
  const wikiTestWikiPath = path.resolve(wikiTestRootPath, 'wiki');
  const settingsPath = path.resolve(process.cwd(), 'test-artifacts', scenarioSlug, 'userData-test', 'settings', 'settings.json');
  const settingsDirectory = path.dirname(settingsPath);

  // 1. Create sub-wiki folder
  const subWikiPath = path.join(wikiTestRootPath, subWikiName);
  await fs.ensureDir(subWikiPath);

  // 2. Create tiddler files
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 17);

  for (const tiddler of tiddlers) {
    const tiddlerFilePath = path.join(subWikiPath, `${tiddler.title}.tid`);
    const tiddlerFileContent = `created: ${timestamp}
modified: ${timestamp}
tags: ${tiddler.tags}
title: ${tiddler.title}

${tiddler.content}
`;
    await fs.writeFile(tiddlerFilePath, tiddlerFileContent, 'utf-8');
  }

  // 2.5. Create tidgi.config.json for sub-wiki (so step can find workspace by name)
  const subWikiTidgiConfigPath = path.join(subWikiPath, 'tidgi.config.json');
  await fs.writeJson(subWikiTidgiConfigPath, { name: subWikiName }, { spaces: 2 });

  // 3. Create main wiki folder structure (if not exists)
  const mainWikiPath = wikiTestWikiPath;
  const templatePath = path.join(process.cwd(), 'template', 'wiki');
  if (!await fs.pathExists(mainWikiPath)) {
    await fs.copy(templatePath, mainWikiPath);
    // Remove .git from template
    await fs.remove(path.join(mainWikiPath, '.git')).catch(() => {/* ignore */});
  }

  // 4. Update settings.json with both main wiki and sub-wiki workspaces
  await fs.ensureDir(settingsDirectory);
  let settings: { workspaces?: Record<string, IWorkspace> } & Record<string, unknown> = {};
  if (await fs.pathExists(settingsPath)) {
    settings = await fs.readJson(settingsPath) as { workspaces?: Record<string, IWorkspace> };
  }

  // Generate unique IDs
  const mainWikiId = 'main-wiki-test-id';
  const subWikiId = `sub-wiki-${subWikiName}-test-id`;

  // Create main wiki workspace if not exists
  if (!settings.workspaces) {
    settings.workspaces = {};
  }

  // Check if main wiki already exists
  const existingMainWiki = Object.values(settings.workspaces).find(
    ws => 'wikiFolderLocation' in ws && ws.wikiFolderLocation === mainWikiPath,
  );

  const mainWikiIdToUse = existingMainWiki?.id ?? mainWikiId;

  if (!existingMainWiki) {
    settings.workspaces[mainWikiId] = {
      id: mainWikiId,
      name: 'wiki',
      wikiFolderLocation: mainWikiPath,
      isSubWiki: false,
      storageService: 'local',
      backupOnInterval: true,
      excludedPlugins: [],
      enableHTTPAPI: false,
      includeTagTree: false,
      fileSystemPathFilterEnable: false,
      fileSystemPathFilter: null,
      tagNames: [],
      userName: '',
      order: 0,
      port: 5212,
      readOnlyMode: false,
      tokenAuth: false,
      tagName: null,
      mainWikiToLink: null,
      mainWikiID: null,
      enableFileSystemWatch: true,
      lastNodeJSArgv: [],
      homeUrl: `tidgi://${mainWikiId}`,
      gitUrl: null,
      active: true,
      hibernated: false,
      hibernateWhenUnused: false,
      lastUrl: null,
      picturePath: null,
      syncOnInterval: false,
      syncOnStartup: true,
      transparentBackground: false,
    } as unknown as IWorkspace;
  }

  // Create sub-wiki workspace with optional settings
  settings.workspaces[subWikiId] = {
    id: subWikiId,
    name: subWikiName,
    wikiFolderLocation: subWikiPath,
    isSubWiki: true,
    mainWikiToLink: mainWikiPath,
    mainWikiID: mainWikiIdToUse,
    storageService: 'local',
    backupOnInterval: true,
    excludedPlugins: [],
    enableHTTPAPI: false,
    includeTagTree: options.includeTagTree ?? false,
    fileSystemPathFilterEnable: Boolean(options.fileSystemPathFilter),
    fileSystemPathFilter: options.fileSystemPathFilter ?? null,
    tagNames: [tagName],
    userName: '',
    order: 1,
    port: 5213,
    readOnlyMode: false,
    tokenAuth: false,
    enableFileSystemWatch: true,
    lastNodeJSArgv: [],
    homeUrl: `tidgi://${subWikiId}`,
    gitUrl: null,
    active: false,
    hibernated: false,
    hibernateWhenUnused: false,
    lastUrl: null,
    picturePath: null,
    syncOnInterval: false,
    syncOnStartup: true,
    transparentBackground: false,
  } as unknown as IWorkspace;

  await fs.writeJson(settingsPath, settings, { spaces: 2 });
}

/**
 * Setup a sub-wiki with tiddlers (basic, no special options)
 */
Given('I setup a sub-wiki {string} with tag {string} and tiddlers:', async function(
  this: ApplicationWorld,
  subWikiName: string,
  tagName: string,
  dataTable: DataTable,
) {
  const rows = dataTable.hashes();
  await setupSubWiki(this.scenarioSlug, subWikiName, tagName, {}, rows);
});

/**
 * Setup a sub-wiki with includeTagTree enabled and tiddlers
 */
Given('I setup a sub-wiki {string} with tag {string} and includeTagTree enabled and tiddlers:', async function(
  this: ApplicationWorld,
  subWikiName: string,
  tagName: string,
  dataTable: DataTable,
) {
  const rows = dataTable.hashes();
  await setupSubWiki(this.scenarioSlug, subWikiName, tagName, { includeTagTree: true }, rows);
});

/**
 * Setup a sub-wiki with custom filter and tiddlers
 */
Given('I setup a sub-wiki {string} with tag {string} and filter {string} and tiddlers:', async function(
  this: ApplicationWorld,
  subWikiName: string,
  tagName: string,
  filter: string,
  dataTable: DataTable,
) {
  const rows = dataTable.hashes();
  await setupSubWiki(this.scenarioSlug, subWikiName, tagName, { fileSystemPathFilter: filter }, rows);
});

export { clearGitTestData, clearHibernationTestData, clearSubWikiRoutingTestData, clearTestIdLogs };

/**
 * Clear all test-id markers from log files to ensure fresh logs for next test phase
 */
async function clearTestIdLogs(world: ApplicationWorld) {
  const logPath = getLogPath(world);

  if (!await fs.pathExists(logPath)) {
    return;
  }

  const logFiles = await fs.readdir(logPath);

  for (const file of logFiles) {
    if (file.endsWith('.log')) {
      const filePath = path.join(logPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        // Remove all lines containing [test-id-
        const lines = content.split('\n');
        const filteredLines = lines.filter(line => !line.includes('[test-id-'));
        await fs.writeFile(filePath, filteredLines.join('\n'), 'utf-8');
      } catch (error) {
        console.warn(`Failed to clear test-id markers from ${file}:`, error);
      }
    }
  }
}

When('I clear test-id markers from logs', async function(this: ApplicationWorld) {
  await clearTestIdLogs(this);
});

/**
 * Clear log lines containing a specific marker from all log files.
 * This is more targeted than clearTestIdLogs - it only removes lines matching the marker.
 * @param marker - The text pattern to remove from log files
 */
async function clearLogLinesContaining(world: ApplicationWorld, marker: string) {
  const logDirectory = getLogPath(world);
  if (!await fs.pathExists(logDirectory)) return;

  const logFiles = (await fs.readdir(logDirectory)).filter(f => f.endsWith('.log'));

  for (const logFile of logFiles) {
    const logFilePath = path.join(logDirectory, logFile);
    try {
      const content = await fs.readFile(logFilePath, 'utf-8');
      const filteredLines = content.split('\n').filter(line => !line.includes(marker));
      await fs.writeFile(logFilePath, filteredLines.join('\n'), 'utf-8');
    } catch (error) {
      console.warn(`Failed to clear log lines from ${logFile}:`, error);
    }
  }
}

/**
 * Verify JSON file contains expected values using JSONPath
 * Example:
 *   Then file "config-test-wiki/tidgi.config.json" should contain JSON with:
 *     | jsonPath       | value          |
 *     | $.name         | ConfigTestWiki |
 *     | $.port         | 5300           |
 */
Then('file {string} should contain JSON with:', async function(this: ApplicationWorld, fileName: string, dataTable: DataTable) {
  const rows = dataTable.hashes();
  const filePath = path.join(getWikiTestRootPath(this), fileName);

  await backOff(
    async () => {
      if (!await fs.pathExists(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = await fs.readFile(filePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json = JSON.parse(content);

      for (const row of rows) {
        const jsonPath = row.jsonPath;
        const expectedValue = row.value;

        // Simple JSONPath implementation for basic paths like $.name, $.port
        const pathParts = jsonPath.replace(/^\$\./, '').split('.');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        let actualValue = json;

        for (const part of pathParts) {
          if (actualValue && typeof actualValue === 'object' && part in actualValue) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            actualValue = actualValue[part];
          } else {
            throw new Error(`Path ${jsonPath} not found in JSON`);
          }
        }

        // Convert to string for comparison
        const actualValueString = String(actualValue);
        if (actualValueString !== expectedValue) {
          throw new Error(`Expected ${jsonPath} to be "${expectedValue}", but got "${actualValueString}"`);
        }
      }
    },
    BACKOFF_OPTIONS,
  );
});

/**
 * Remove workspace without deleting files (via API)
 */
When('I remove workspace {string} keeping files', async function(this: ApplicationWorld, workspaceName: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!await fs.pathExists(getSettingsPath(this))) {
    throw new Error(`Settings file not found at ${getSettingsPath(this)}`);
  }

  // Read settings file to get workspace ID
  const settings = await fs.readJson(getSettingsPath(this)) as { workspaces?: Record<string, IWorkspace> };
  const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};

  // Find workspace by name - check both settings.json and tidgi.config.json
  let targetWorkspaceId: string | undefined;
  for (const [id, workspace] of Object.entries(workspaces)) {
    if (workspace.pageType) continue; // Skip page workspaces

    let workspaceName_: string | undefined = workspace.name;

    // If name is not in settings.json, try to read from tidgi.config.json
    if (!workspaceName_ && isWikiWorkspace(workspace)) {
      try {
        const tidgiConfigPath = path.join(workspace.wikiFolderLocation, 'tidgi.config.json');
        if (await fs.pathExists(tidgiConfigPath)) {
          const tidgiConfig = await fs.readJson(tidgiConfigPath) as { name?: string };
          workspaceName_ = tidgiConfig.name;
        }
      } catch {
        // Ignore errors reading tidgi.config.json
      }
    }

    if (workspaceName_ === workspaceName) {
      targetWorkspaceId = id;
      break;
    }
  }

  if (!targetWorkspaceId) {
    throw new Error(`No workspace found with name: ${workspaceName}`);
  }

  // Remove workspace via API (without showing dialog, directly call remove)
  await this.app.evaluate(async ({ BrowserWindow }, { workspaceId }: { workspaceId: string }) => {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(win => !win.isDestroyed() && win.webContents && win.webContents.getURL().includes('index.html'));

    if (!mainWindow) {
      throw new Error('Main window not found');
    }

    // Stop wiki and remove workspace without deleting files
    await mainWindow.webContents.executeJavaScript(`
      (async () => {
        await window.service.wiki.stopWiki(${JSON.stringify(workspaceId)});
        await window.service.workspaceView.removeWorkspaceView(${JSON.stringify(workspaceId)});
        await window.service.workspace.remove(${JSON.stringify(workspaceId)});
      })();
    `);
  }, { workspaceId: targetWorkspaceId });

  // Wait for removal to propagate
  await this.app.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
  });
});
