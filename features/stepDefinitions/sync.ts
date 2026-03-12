import { Then, When } from '@cucumber/cucumber';
import { exec as gitExec } from 'dugite';
import { backOff } from 'exponential-backoff';
import fs from 'fs-extra';
import path from 'path';
import type { IWorkspace } from '../../src/services/workspaces/interface';
import { getSettingsPath, getWikiTestRootPath } from '../supports/paths';
import type { ApplicationWorld } from './application';

/**
 * Read settings.json and find workspace by name, returning its id and port.
 */
async function getWorkspaceInfo(world: ApplicationWorld, workspaceName: string): Promise<{ id: string; port: number }> {
  const settings = await fs.readJson(getSettingsPath(world)) as { workspaces?: Record<string, IWorkspace> };
  const workspaces = settings.workspaces ?? {};
  for (const [id, workspace] of Object.entries(workspaces)) {
    if ('wikiFolderLocation' in workspace) {
      const wikiWorkspace = workspace;
      const folderName = path.basename(wikiWorkspace.wikiFolderLocation);
      if (folderName === workspaceName || wikiWorkspace.name === workspaceName) {
        return { id, port: wikiWorkspace.port ?? 5212 };
      }
    }
  }
  throw new Error(`Workspace "${workspaceName}" not found in settings`);
}

/**
 * Wait for TiddlyWiki's HTTP server to be reachable at the given port.
 */
async function waitForHTTPReady(port: number, maxAttempts = 40, intervalMs = 500): Promise<void> {
  const http = await import('node:http');
  for (let index = 0; index < maxAttempts; index++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const request = http.get(`http://127.0.0.1:${port}/status`, (response) => {
          response.resume(); // drain
          if (response.statusCode === 200) resolve();
          else reject(new Error(`HTTP ${response.statusCode}`));
        });
        request.on('error', reject);
        request.setTimeout(1000, () => {
          request.destroy();
          reject(new Error('timeout'));
        });
      });
      return; // success
    } catch {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error(`HTTP server on port ${port} not reachable after ${maxAttempts} attempts`);
}

/**
 * Create a bare git repository to use as a local remote for testing sync
 */
When('I create a bare git repository at {string}', async function(this: ApplicationWorld, repoPath: string) {
  const actualPath = repoPath.replace('{tmpDir}', getWikiTestRootPath(this));

  // Remove if exists
  if (await fs.pathExists(actualPath)) {
    await fs.remove(actualPath);
  }

  // Create bare repository with main as default branch (matching TidGi's default)
  await fs.ensureDir(actualPath);
  await gitExec(['init', '--bare', '--initial-branch=main'], actualPath);
});

/**
 * Verify that a commit with specific message exists in remote repository
 */
Then('the remote repository {string} should contain commit with message {string}', async function(this: ApplicationWorld, remotePath: string, commitMessage: string) {
  const wikiTestRoot = getWikiTestRootPath(this);
  const actualRemotePath = remotePath.replace('{tmpDir}', wikiTestRoot);

  // Clone the remote to a temporary location to inspect it
  const temporaryClonePath = path.join(wikiTestRoot, `temp-clone-${Date.now()}`);

  try {
    await gitExec(['clone', actualRemotePath, temporaryClonePath], wikiTestRoot);

    // Check all branches for the commit message
    const branchResult = await gitExec(['branch', '-a'], temporaryClonePath);
    if (branchResult.exitCode !== 0) {
      throw new Error(`Failed to list branches: ${branchResult.stderr}`);
    }

    // Try to find commits in any branch
    let foundCommit = false;
    const branches = branchResult.stdout.split('\n').filter(b => b.trim());

    for (const branch of branches) {
      const branchName = branch.trim().replace('* ', '').replace('remotes/origin/', '');
      if (!branchName) continue;

      try {
        // Checkout the branch
        await gitExec(['checkout', branchName], temporaryClonePath);

        // Get commit log
        const result = await gitExec(['log', '--oneline', '-10'], temporaryClonePath);
        if (result.exitCode === 0 && result.stdout.includes(commitMessage)) {
          foundCommit = true;
          break;
        }
      } catch {
        // Branch might not exist or be checkable, continue to next
        continue;
      }
    }

    if (!foundCommit) {
      // Get all logs from all branches for error message
      const allLogsResult = await gitExec(['log', '--all', '--oneline', '-20'], temporaryClonePath);
      throw new Error(`Commit with message "${commitMessage}" not found in any branch. Available commits:\n${allLogsResult.stdout}\n\nBranches:\n${branchResult.stdout}`);
    }
  } finally {
    // Clean up temporary clone
    if (await fs.pathExists(temporaryClonePath)) {
      await fs.remove(temporaryClonePath);
    }
  }
});

/**
 * Verify that a file exists in remote repository
 */
Then('the remote repository {string} should contain file {string}', async function(this: ApplicationWorld, remotePath: string, filePath: string) {
  const wikiTestRoot = getWikiTestRootPath(this);
  const actualRemotePath = remotePath.replace('{tmpDir}', wikiTestRoot);

  // Clone the remote to a temporary location to inspect it
  const temporaryClonePath = path.join(wikiTestRoot, `temp-clone-${Date.now()}`);

  try {
    await gitExec(['clone', actualRemotePath, temporaryClonePath], wikiTestRoot);

    // Check all branches for the file
    const branchResult = await gitExec(['branch', '-a'], temporaryClonePath);
    if (branchResult.exitCode !== 0) {
      throw new Error(`Failed to list branches: ${branchResult.stderr}`);
    }

    let foundFile = false;
    const branches = branchResult.stdout.split('\n').filter(b => b.trim());

    for (const branch of branches) {
      const branchName = branch.trim().replace('* ', '').replace('remotes/origin/', '');
      if (!branchName) continue;

      try {
        // Checkout the branch
        await gitExec(['checkout', branchName], temporaryClonePath);

        const fileFullPath = path.join(temporaryClonePath, filePath);
        if (await fs.pathExists(fileFullPath)) {
          foundFile = true;
          break;
        }
      } catch {
        // Branch might not exist or be checkable, continue to next
        continue;
      }
    }

    if (!foundFile) {
      throw new Error(`File "${filePath}" not found in any branch of remote repository`);
    }
  } finally {
    // Clean up temporary clone
    if (await fs.pathExists(temporaryClonePath)) {
      await fs.remove(temporaryClonePath);
    }
  }
});

/**
 * Simulate an external push (e.g. from TidGi Mobile) to the bare repository.
 * Clones the bare repo, adds/overwrites a file, commits, and pushes back.
 */
When(
  'I push a commit to bare repository {string} adding file {string} with content:',
  async function(this: ApplicationWorld, remotePath: string, filePath: string, content: string) {
    const wikiTestRoot = getWikiTestRootPath(this);
    const actualRemotePath = remotePath.replace('{tmpDir}', wikiTestRoot);
    const temporaryClonePath = path.join(wikiTestRoot, `temp-push-${Date.now()}`);

    try {
      // Clone the bare repo into a temporary working copy
      const cloneResult = await gitExec(['clone', actualRemotePath, temporaryClonePath], wikiTestRoot);
      if (cloneResult.exitCode !== 0) {
        throw new Error(`Failed to clone bare repo for simulated push: ${cloneResult.stderr}`);
      }

      // Write the file
      const targetFile = path.join(temporaryClonePath, filePath);
      await fs.ensureDir(path.dirname(targetFile));
      await fs.writeFile(targetFile, content, 'utf-8');

      // Configure git user for the commit
      await gitExec(['config', 'user.name', 'MobileUser'], temporaryClonePath);
      await gitExec(['config', 'user.email', 'mobile@example.com'], temporaryClonePath);

      // Stage, commit, and push
      await gitExec(['add', '.'], temporaryClonePath);
      const commitResult = await gitExec(['commit', '-m', 'Mobile sync commit'], temporaryClonePath);
      if (commitResult.exitCode !== 0) {
        throw new Error(`Simulated mobile commit failed: ${commitResult.stderr}`);
      }
      const pushResult = await gitExec(['push', 'origin', 'HEAD'], temporaryClonePath);
      if (pushResult.exitCode !== 0) {
        throw new Error(`Simulated mobile push failed: ${pushResult.stderr}`);
      }
    } finally {
      if (await fs.pathExists(temporaryClonePath)) {
        await fs.remove(temporaryClonePath);
      }
    }
  },
);

/**
 * Assert that a file in the test workspace contains certain text.
 * Supports {tmpDir} placeholder. Retries with backoff to allow for filesystem sync.
 */
Then('file {string} should contain text {string}', async function(this: ApplicationWorld, filePath: string, expectedText: string) {
  const actualPath = filePath.replace('{tmpDir}', getWikiTestRootPath(this));

  await backOff(
    async () => {
      if (!await fs.pathExists(actualPath)) {
        throw new Error(`File not found: ${actualPath}`);
      }
      const content = await fs.readFile(actualPath, 'utf-8');
      if (!content.includes(expectedText)) {
        throw new Error(`Expected text "${expectedText}" not found in ${actualPath}. Content:\n${content.substring(0, 500)}`);
      }
    },
    { numOfAttempts: 10, startingDelay: 200, timeMultiple: 1, maxDelay: 200 },
  );
});

/**
 * Assert that a file does NOT contain certain text (e.g. conflict markers).
 */
Then('file {string} should not contain text {string}', async function(this: ApplicationWorld, filePath: string, forbiddenText: string) {
  const actualPath = filePath.replace('{tmpDir}', getWikiTestRootPath(this));

  await backOff(
    async () => {
      if (!await fs.pathExists(actualPath)) {
        throw new Error(`File not found: ${actualPath}`);
      }
      const content = await fs.readFile(actualPath, 'utf-8');
      if (content.includes(forbiddenText)) {
        throw new Error(`Forbidden text "${forbiddenText}" was found in ${actualPath}. Content:\n${content.substring(0, 500)}`);
      }
    },
    { numOfAttempts: 10, startingDelay: 200, timeMultiple: 1, maxDelay: 200 },
  );
});

/**
 * Clone the desktop workspace's git repo via TiddlyWiki's Smart HTTP endpoints
 * provided by the tw-mobile-sync plugin.
 * URL: http://localhost:{port}/tw-mobile-sync/git/{workspaceId}
 */
When('I clone workspace {string} via HTTP to {string}', async function(this: ApplicationWorld, workspaceName: string, targetPath: string) {
  const actualPath = targetPath.replace('{tmpDir}', getWikiTestRootPath(this));
  const { id, port } = await getWorkspaceInfo(this, workspaceName);
  const httpUrl = `http://127.0.0.1:${port}/tw-mobile-sync/git/${id}`;

  if (await fs.pathExists(actualPath)) {
    await fs.remove(actualPath);
  }

  // Wait for HTTP server to be reachable before cloning
  await waitForHTTPReady(port);

  // TiddlyWiki CSRF requires X-Requested-With header on POST requests;
  // TidGi Mobile sends it via isomorphic-git, tests use git's http.extraHeader.
  // http.proxy= disables system proxy so localhost requests go direct.
  const cloneResult = await gitExec(
    ['-c', 'http.proxy=', '-c', 'http.extraHeader=X-Requested-With: TiddlyWiki', 'clone', '--verbose', httpUrl, actualPath],
    getWikiTestRootPath(this),
  );
  if (cloneResult.exitCode !== 0) {
    throw new Error(`HTTP clone failed (url=${httpUrl}): ${cloneResult.stderr}`);
  }
});

/**
 * Simulate TidGi-Mobile's simplified sync cycle: commit → push to branch → pull main.
 *
 * Mobile does NO merge or conflict resolution — all that happens on desktop.
 * 1. Stage & commit all local changes
 * 2. Force-push to `mobile-incoming` branch on desktop (always succeeds)
 * 3. Desktop's gitSmartHTTPReceivePack$ auto-merges `mobile-incoming` into `main`
 *    with .tid-aware conflict resolution before the HTTP response completes
 * 4. Pull `main` from desktop (fast-forward — desktop already merged)
 */
When('I sync {string} via HTTP to workspace {string}', async function(this: ApplicationWorld, clonePath: string, workspaceName: string) {
  const actualClonePath = clonePath.replace('{tmpDir}', getWikiTestRootPath(this));
  const { id, port } = await getWorkspaceInfo(this, workspaceName);
  const httpUrl = `http://127.0.0.1:${port}/tw-mobile-sync/git/${id}`;

  await gitExec(['config', 'user.name', 'MobileUser'], actualClonePath);
  await gitExec(['config', 'user.email', 'mobile@example.com'], actualClonePath);
  await gitExec(['remote', 'set-url', 'origin', httpUrl], actualClonePath);

  // Step 1: Commit local changes
  await gitExec(['add', '.'], actualClonePath);
  const commitResult = await gitExec(['commit', '-m', 'Mobile sync commit'], actualClonePath);
  if (commitResult.exitCode !== 0) {
    throw new Error(`Mobile commit failed: ${commitResult.stderr}`);
  }

  // Step 2: Force-push local main to remote mobile-incoming branch.
  // Force is needed because the remote branch may have stale refs from a previous sync cycle.
  const pushResult = await gitExec(
    ['-c', 'http.proxy=', '-c', 'http.extraHeader=X-Requested-With: TiddlyWiki', 'push', '--force', 'origin', 'main:refs/heads/mobile-incoming'],
    actualClonePath,
  );
  if (pushResult.exitCode !== 0) {
    throw new Error(`HTTP push to mobile-incoming failed (url=${httpUrl}): ${pushResult.stderr}`);
  }

  // Step 3: Ask desktop to merge mobile-incoming into main.
  // This is a separate HTTP call (not part of git protocol) because the git client
  // closes the connection before the server can do post-receive work.
  const mergeUrl = `http://127.0.0.1:${port}/tw-mobile-sync/git/${id}/merge-incoming`;
  const http = await import('node:http');
  await new Promise<void>((resolve, reject) => {
    const request = http.request(mergeUrl, { method: 'POST', headers: { 'X-Requested-With': 'TiddlyWiki' } }, (response) => {
      let body = '';
      response.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      response.on('end', () => {
        if (response.statusCode === 200) resolve();
        else reject(new Error(`merge-incoming returned ${response.statusCode}: ${body}`));
      });
    });
    request.on('error', reject);
    request.end();
  });

  // Step 4: Fetch main and reset to it.
  // After desktop merges mobile-incoming, remote main contains a merge commit
  // that is NOT a descendant of our local main (it's a sibling merged with desktop changes).
  const fetchResult = await gitExec(
    ['-c', 'http.proxy=', '-c', 'http.extraHeader=X-Requested-With: TiddlyWiki', 'fetch', 'origin', 'main'],
    actualClonePath,
  );
  if (fetchResult.exitCode !== 0) {
    throw new Error(`HTTP fetch main failed (url=${httpUrl}): ${fetchResult.stderr}`);
  }
  const resetResult = await gitExec(['reset', '--hard', 'origin/main'], actualClonePath);
  if (resetResult.exitCode !== 0) {
    throw new Error(`Reset to origin/main failed: ${resetResult.stderr}`);
  }
});
