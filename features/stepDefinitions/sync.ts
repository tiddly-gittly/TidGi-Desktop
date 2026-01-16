import { Then, When } from '@cucumber/cucumber';
import { exec as gitExec } from 'dugite';
import fs from 'fs-extra';
import path from 'path';
import type { ApplicationWorld } from './application';

// Helper function to get scenario-specific wiki test root path
function getWikiTestRootPath(world: ApplicationWorld): string {
  return path.resolve(process.cwd(), 'test-artifacts', world.scenarioSlug, 'wiki-test');
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

  // Create bare repository
  await fs.ensureDir(actualPath);
  await gitExec(['init', '--bare'], actualPath);
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
