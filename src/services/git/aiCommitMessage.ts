import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { waitForAIStreamResult } from '@services/externalAPI/waitForAIStreamResult';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { exec as gitExec } from 'dugite';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MAX_UNTRACKED_FILES = 5;
const MAX_FILE_CONTENT_LENGTH = 500;
const MAX_DIFF_LENGTH = 3000;

/**
 * Filter out large plugin file diffs to avoid sending huge JSON to AI
 * Small config files (<1000 chars) are kept for AI to see what changed
 */
function filterLargePluginDiffs(diff: string): string {
  const SMALL_FILE_THRESHOLD = 1000; // Characters - config files are usually small
  const diffChunks = diff.split(/(?=diff --git)/);
  return diffChunks.map((chunk) => {
    // Match any file containing $__plugins (regardless of path)
    const pluginFileMatch = chunk.match(/diff --git a\/(.+\$__plugins_[^/\s]+(?:\.\w+)?)\s+b\//);
    if (pluginFileMatch) {
      const filename = pluginFileMatch[1];
      const pluginName = filename.match(/(\$__plugins_[^/\s]+)/)?.[1] ?? 'unknown';

      // If diff is small (likely a config file), keep the content
      if (chunk.length < SMALL_FILE_THRESHOLD) {
        return chunk;
      }

      // Large file (plugin itself) - omit content
      return `diff --git a/${filename} b/${filename}\n@@ Plugin file modified: ${pluginName} (large file content omitted to save tokens) @@\n`;
    }
    return chunk;
  }).join('');
}

/**
 * Read content of untracked tiddler files for AI context
 */
async function getUntrackedFileContents(wikiFolderPath: string): Promise<string> {
  // Use -uall to show all untracked files, not just directories
  const statusResult = await gitExec(['status', '--porcelain', '-uall'], wikiFolderPath);
  if (statusResult.exitCode !== 0 || !statusResult.stdout?.trim()) {
    return '';
  }

  const lines = statusResult.stdout.trim().split('\n');
  const untrackedFiles = lines
    .filter((line: string) => line.startsWith('??'))
    .map((line: string) => line.slice(3).trim())
    .filter((file: string) => file.endsWith('.tid') || file.endsWith('.meta'));

  if (untrackedFiles.length === 0) {
    return `Git status:\n${statusResult.stdout.trim()}`;
  }

  const filesToRead = untrackedFiles.slice(0, MAX_UNTRACKED_FILES);
  const fileContents = await Promise.all(filesToRead.map(async (file) => {
    try {
      const content = await fs.readFile(path.join(wikiFolderPath, file), 'utf-8');
      const truncated = content.length > MAX_FILE_CONTENT_LENGTH ? content.slice(0, MAX_FILE_CONTENT_LENGTH) + '...' : content;
      return `=== New file: ${file} ===\n${truncated}`;
    } catch {
      return `=== New file: ${file} (content unavailable) ===`;
    }
  }));

  let result = `New tiddler files added:\n${fileContents.join('\n\n')}`;
  if (untrackedFiles.length > filesToRead.length) {
    result += `\n\n... and ${untrackedFiles.length - filesToRead.length} more files`;
  }
  return result;
}

/**
 * Get git changes (diff for tracked files, content for untracked files)
 */
async function getGitChanges(wikiFolderPath: string): Promise<string | undefined> {
  const [unstagedResult, stagedResult] = await Promise.all([
    gitExec(['diff'], wikiFolderPath),
    gitExec(['diff', '--cached'], wikiFolderPath),
  ]);

  let changes = [unstagedResult.stdout || '', stagedResult.stdout || ''].filter(Boolean).join('\n').trim();

  // If no tracked changes, check untracked files
  if (!changes) {
    changes = await getUntrackedFileContents(wikiFolderPath);
  }

  if (!changes) {
    return undefined;
  }

  const filtered = filterLargePluginDiffs(changes);
  return filtered.length > MAX_DIFF_LENGTH ? filtered.slice(0, MAX_DIFF_LENGTH) + '\n... (truncated)' : filtered;
}

/**
 * Generate a commit message using AI based on git diff
 * @param wikiFolderPath The wiki folder path
 * @param source The source of the call (for debugging)
 */
export async function generateAICommitMessage(wikiFolderPath: string, source: string = 'unknown'): Promise<string | undefined> {
  try {
    const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
    const preferences = preferenceService.getPreferences();

    if (!preferences.aiGenerateBackupTitle) {
      return undefined;
    }

    const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    const aiConfig = await externalAPIService.getAIConfig();

    if (!aiConfig?.free?.model || !aiConfig?.free?.provider) {
      return undefined;
    }

    const changes = await getGitChanges(wikiFolderPath);
    if (!changes) {
      logger.info('No changes found, skipping AI commit message generation', { source });
      return undefined;
    }

    const prompt = `You are a helpful assistant that generates concise git commit messages.
Based on the following tiddlywiki note git diff, generate a clear and concise commit message in the same language as the changes (In most possible language that user is using).
The message should be a single line, no more than 80 characters, describing what changed.
Do not include prefixes like "feat:" or "fix:", just describe the change naturally.

Git diff:
${changes}

Generate only the commit message, nothing else:`;

    const timeout = preferences.aiGenerateBackupTitleTimeout ?? 5000;
    logger.debug('Starting AI commit message generation', { timeout, source });

    const startTime = Date.now();
    const commitMessage = await Promise.race([
      waitForAIStreamResult(prompt, aiConfig, externalAPIService).then((result) => {
        logger.debug('AI commit message generation completed', { elapsed: Date.now() - startTime });
        return result;
      }),
      new Promise<undefined>((resolve) =>
        setTimeout(() => {
          logger.warn('AI commit message generation timed out', { timeout, elapsed: Date.now() - startTime });
          resolve(undefined);
        }, timeout)
      ),
    ]);

    if (commitMessage) {
      logger.info('AI generated commit message', { commitMessage, elapsed: Date.now() - startTime });
      return commitMessage.trim();
    }

    logger.debug('AI commit message generation returned undefined', { elapsed: Date.now() - startTime, timeout });
    return undefined;
  } catch (error) {
    logger.error('Failed to generate AI commit message', { error });
    return undefined;
  }
}
