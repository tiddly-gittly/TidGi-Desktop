import type { IWikiWorkspace } from '@services/workspaces/interface';
import fs from 'fs';
import path from 'path';
import type { IFileInfo } from 'tiddlywiki';

/**
 * External attachment utilities for moving files when tiddlers are routed between workspaces.
 * These utilities are exposed as $tw.utils functions.
 */

/**
 * Determine wiki root folder from a tiddler file path.
 * Main wiki stores tiddlers in /tiddlers subfolder, sub-wikis store directly in root.
 */
function getWikiRootFromTiddlerPath(
  tiddlerDirectory: string,
  wikisWithRouting: IWikiWorkspace[],
): string | undefined {
  const wikiTiddlersPath = $tw.boot.wikiTiddlersPath;

  // Check if this is the main wiki's tiddlers folder
  if (wikiTiddlersPath && path.normalize(tiddlerDirectory).startsWith(path.normalize(wikiTiddlersPath))) {
    // Main wiki: tiddlers are in /wiki/tiddlers, wiki root is /wiki
    return path.dirname(wikiTiddlersPath);
  }

  // Check sub-wikis
  for (const subWiki of wikisWithRouting) {
    let subWikiPath = subWiki.wikiFolderLocation;
    try {
      subWikiPath = fs.realpathSync(subWikiPath);
    } catch {
      // Use original if realpath fails
    }
    if (path.normalize(tiddlerDirectory).startsWith(path.normalize(subWikiPath))) {
      return subWikiPath;
    }
  }

  return undefined;
}

/**
 * Move external attachment file when tiddler is moved between workspaces.
 * When tags change and tiddler is routed to a different sub-wiki, we need to
 * also move the external attachment file (referenced by _canonical_uri) to
 * the new wiki's files folder.
 *
 * @param canonicalUri - The _canonical_uri field value from the tiddler
 * @param oldFileInfo - The previous file info (before save)
 * @param newFileInfo - The new file info (after save)
 * @param wikisWithRouting - List of workspaces with routing configuration
 */
async function moveExternalAttachmentIfNeeded(
  canonicalUri: string | undefined,
  oldFileInfo: IFileInfo | undefined,
  newFileInfo: IFileInfo,
  wikisWithRouting: IWikiWorkspace[],
): Promise<void> {
  const logger = new $tw.utils.Logger('filesystem', { colour: 'blue' });

  // Only process tiddlers with external attachments
  if (typeof canonicalUri !== 'string' || !canonicalUri) {
    return;
  }

  // Skip absolute paths or URLs (not managed by us)
  if (canonicalUri.startsWith('/') || canonicalUri.startsWith('file://') || canonicalUri.includes('://')) {
    return;
  }

  // Get the wiki folder for files (e.g., "files/")
  const wikiFolderToMove = $tw.wiki.getTiddlerText('$:/config/ExternalAttachments/WikiFolderToMove', 'files');
  if (!wikiFolderToMove) {
    return;
  }

  // Check if the file is in a managed folder
  if (!canonicalUri.startsWith(wikiFolderToMove)) {
    return;
  }

  // Need old file info to determine source location
  if (!oldFileInfo?.filepath) {
    return;
  }

  // Calculate old and new wiki folder locations based on tiddler file paths
  const oldTiddlerDirectory = path.dirname(oldFileInfo.filepath);
  const newTiddlerDirectory = path.dirname(newFileInfo.filepath);

  // If directories are the same, no need to move
  if (path.normalize(oldTiddlerDirectory) === path.normalize(newTiddlerDirectory)) {
    return;
  }

  // Find the wiki root from the tiddler directory
  // Sub-wikis store tiddlers directly in root, main wiki uses /tiddlers subfolder
  const oldWikiRoot = getWikiRootFromTiddlerPath(oldTiddlerDirectory, wikisWithRouting);
  const newWikiRoot = getWikiRootFromTiddlerPath(newTiddlerDirectory, wikisWithRouting);

  if (!oldWikiRoot || !newWikiRoot || oldWikiRoot === newWikiRoot) {
    return;
  }

  // Decode the canonical URI (it's URL-encoded)
  const decodedCanonicalUri = decodeURIComponent(canonicalUri);
  const fileName = path.basename(decodedCanonicalUri);

  // Calculate source and target file paths
  const sourceFilePath = path.join(oldWikiRoot, decodedCanonicalUri);
  const targetFolder = path.join(newWikiRoot, wikiFolderToMove);
  const targetFilePath = path.join(targetFolder, fileName);

  // Check if source file exists
  if (!fs.existsSync(sourceFilePath)) {
    logger.log(`External attachment file not found at ${sourceFilePath}, skipping move`);
    return;
  }

  // Create target directory if needed
  $tw.utils.createDirectory(targetFolder);

  // Move the file
  try {
    await fs.promises.rename(sourceFilePath, targetFilePath);
    logger.log(`Moved external attachment from ${sourceFilePath} to ${targetFilePath}`);
  } catch (error) {
    // If rename fails (cross-device), try copy + delete
    if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
      try {
        await fs.promises.copyFile(sourceFilePath, targetFilePath);
        await fs.promises.unlink(sourceFilePath);
        logger.log(`Copied external attachment from ${sourceFilePath} to ${targetFilePath} (cross-device)`);
      } catch (copyError) {
        logger.alert(`Failed to move external attachment: ${(copyError as Error).message}`);
      }
    } else {
      logger.alert(`Failed to move external attachment: ${(error as Error).message}`);
    }
  }
}

declare const exports: Record<string, unknown>;
exports.getWikiRootFromTiddlerPath = getWikiRootFromTiddlerPath;
exports.moveExternalAttachmentIfNeeded = moveExternalAttachmentIfNeeded;
