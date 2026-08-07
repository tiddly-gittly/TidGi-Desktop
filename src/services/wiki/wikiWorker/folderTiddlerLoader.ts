import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { ITiddlersInFile, TiddlyWiki } from 'tiddlywiki';

const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_FILES = 50_000;
const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.cache',
  '.git',
  'cache',
  'files',
  'node_modules',
  'output',
]);
const EXCLUDED_FILE_NAMES = new Set(['tidgi.config.json', 'tiddlywiki.files', 'tiddlywiki.info']);

export class FolderTiddlerScanError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'FolderTiddlerScanError';
  }
}

export interface FolderTiddlerScanOptions {
  maxDepth?: number;
  maxFiles?: number;
  onProgress?: (progress: FolderTiddlerScanProgress) => void;
}

export interface FolderTiddlerScanProgress {
  scannedFileCount: number;
  storagePath: string;
}

export interface FolderTiddlerScanResult {
  files: ITiddlersInFile[];
  scannedFileCount: number;
  storagePath: string;
}

type TiddlyWikiInstance = ReturnType<typeof TiddlyWiki>;

function matchesExcludePattern(pattern: RegExp, fileName: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(fileName);
}

/**
 * Legacy folder workspaces may either store tiddlers directly in their root or
 * retain the conventional `tiddlers/` directory after losing tiddlywiki.info.
 * Prefer the narrower conventional directory whenever it exists.
 */
export function resolveFolderTiddlerStoragePath(workspacePath: string): string {
  const conventionalStoragePath = path.join(workspacePath, 'tiddlers');
  try {
    const stat = lstatSync(conventionalStoragePath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) return realpathSync(conventionalStoragePath);
  } catch {
    // A direct-root folder workspace does not have a tiddlers directory.
  }
  return realpathSync(workspacePath);
}

/**
 * Bounded, no-symlink traversal for folder-as-tiddlers workspaces. The stock
 * TiddlyWiki recursive loader follows symlinks and scans infrastructure folders,
 * which can recurse forever or traverse node_modules and external attachments.
 */
export function scanFolderTiddlers(
  wikiInstance: TiddlyWikiInstance,
  workspacePath: string,
  options: FolderTiddlerScanOptions = {},
): FolderTiddlerScanResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) throw new FolderTiddlerScanError(`Invalid folder tiddler maximum depth: ${maxDepth}`);
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) throw new FolderTiddlerScanError(`Invalid folder tiddler maximum file count: ${maxFiles}`);

  const storagePath = resolveFolderTiddlerStoragePath(workspacePath);
  const visitedDirectories = new Set<string>();
  const files: ITiddlersInFile[] = [];
  let scannedFileCount = 0;

  const visit = (directoryPath: string, depth: number): void => {
    if (depth > maxDepth) {
      throw new FolderTiddlerScanError(`Folder tiddler scan exceeded maximum depth ${maxDepth} at ${directoryPath}`);
    }
    const canonicalDirectoryPath = realpathSync(directoryPath);
    if (visitedDirectories.has(canonicalDirectoryPath)) return;
    visitedDirectories.add(canonicalDirectoryPath);

    const entries = readdirSync(canonicalDirectoryPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (matchesExcludePattern(wikiInstance.boot.excludeRegExp, entry.name)) continue;
      const entryPath = path.join(canonicalDirectoryPath, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name)) visit(entryPath, depth + 1);
        continue;
      }
      if (!entry.isFile() || EXCLUDED_FILE_NAMES.has(entry.name)) continue;
      scannedFileCount += 1;
      if (scannedFileCount > maxFiles) {
        throw new FolderTiddlerScanError(`Folder tiddler scan exceeded maximum file count ${maxFiles} under ${storagePath}`);
      }
      files.push(wikiInstance.loadTiddlersFromFile(entryPath));
      if (scannedFileCount === 1 || scannedFileCount % 500 === 0) {
        options.onProgress?.({ scannedFileCount, storagePath });
      }
    }
  };

  visit(storagePath, 0);
  return { files, scannedFileCount, storagePath };
}
