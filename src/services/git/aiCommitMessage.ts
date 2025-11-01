import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import { waitForAIStreamResult } from '@services/externalAPI/waitForAIStreamResult';
import { logger } from '@services/libs/log';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { GitProcess } from 'dugite';

/**
 * Filter out large plugin file diffs to avoid sending huge JSON to AI
 * For plugin files (tiddlers/$__plugins_*.json), only include the filename
 * @param diff - The git diff output
 * @returns Filtered diff with plugin files replaced by filename only
 */
function filterLargePluginDiffs(diff: string): string {
  // Split diff into file chunks (each chunk starts with "diff --git")
  const diffChunks = diff.split(/(?=diff --git)/);

  const filteredChunks = diffChunks.map((chunk) => {
    // Check if this is a plugin file (.json in tiddlers/$__plugins_*)
    const pluginFileMatch = chunk.match(/diff --git a\/(.*?tiddlers\/\$__plugins_.*?\.json) b\//);

    if (pluginFileMatch) {
      const filename = pluginFileMatch[1];
      // For plugin files, only include the filename, not the full diff
      return `diff --git a/${filename} b/${filename}
--- a/${filename}
+++ b/${filename}
@@ Plugin file modified (content omitted due to size) @@
`;
    }

    return chunk;
  });

  return filteredChunks.join('');
}

/**
 * Generate a commit message using AI based on git diff
 * @param wikiFolderPath - Path to the wiki folder
 * @returns AI-generated commit message, or undefined if generation failed or timed out
 */
export async function generateAICommitMessage(wikiFolderPath: string): Promise<string | undefined> {
  try {
    // Check if AI generation is enabled
    const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
    const preferences = preferenceService.getPreferences();

    if (!preferences.aiGenerateBackupTitle) {
      return undefined;
    }

    // Get AI config
    const externalAPIService = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    const aiConfig = await externalAPIService.getAIConfig();

    // Check if summary model is configured
    if (!aiConfig?.api?.summaryModel || !aiConfig?.api?.provider) {
      return undefined;
    }

    // Get git diff for all changes (both staged and unstaged)
    // Use HEAD as the comparison point to include all uncommitted changes
    const diffResult = await GitProcess.exec(['diff', 'HEAD'], wikiFolderPath);

    if (diffResult.exitCode !== 0 || !diffResult.stdout || diffResult.stdout.trim().length === 0) {
      logger.info('No changes found, skipping AI commit message generation');
      return undefined;
    }

    const diff = diffResult.stdout;

    // Filter out large plugin files - only include filename for .json files in tiddlers/$__plugins_*
    // This prevents sending huge plugin diffs to AI
    const filteredDiff = filterLargePluginDiffs(diff);

    // Limit diff size to avoid token limits (keep first 3000 characters)
    const truncatedDiff = filteredDiff.length > 3000 ? filteredDiff.slice(0, 3000) + '\n... (truncated)' : filteredDiff;

    // Prepare prompt for AI
    const prompt = `You are a helpful assistant that generates concise git commit messages.
Based on the following tiddlywiki note git diff, generate a clear and concise commit message in the same language as the changes (In most possible language that user is using).
The message should be a single line, no more than 80 characters, describing what changed.
Do not include prefixes like "feat:" or "fix:", just describe the change naturally.

Git diff:
${truncatedDiff}

Generate only the commit message, nothing else:`;

    // Call AI with timeout
    const timeout = preferences.aiGenerateBackupTitleTimeout || 1500;
    const commitMessage = await Promise.race([
      waitForAIStreamResult(prompt, aiConfig, externalAPIService),
      new Promise<undefined>((resolve) =>
        setTimeout(() => {
          resolve(undefined);
        }, timeout)
      ),
    ]);

    if (commitMessage) {
      logger.info('AI generated commit message', { commitMessage });
      return commitMessage.trim();
    }

    return undefined;
  } catch (error) {
    logger.error('Failed to generate AI commit message', { error });
    return undefined;
  }
}
