import type nsfw from 'nsfw';
import path from 'path';
import type { FileInfo } from 'tiddlywiki';

export type IBootFilesIndexItemWithTitle = FileInfo & { tiddlerTitle: string };

export interface ISubWikiInfo {
  id: string;
  path: string;
  watcher: nsfw.NSFW;
}

/**
 * Inverse index for mapping file paths to tiddler information.
 * Uses Map for better performance with frequent add/delete operations.
 *
 * This index enables O(1) lookups of tiddler information by file path,
 * which is critical for the file watcher to efficiently process file change events.
 */
export class InverseFilesIndex {
  private index: Map<string, IBootFilesIndexItemWithTitle> = new Map();
  /** Base path for main wiki (e.g., .../wiki/tiddlers) */
  private mainWikiPath: string = '';
  /** Map of sub-wiki ID to sub-wiki information */
  private subWikiMap: Map<string, ISubWikiInfo> = new Map();
  /** Temporarily excluded files for main watcher (by absolute path) */
  private mainExcludedFiles: Set<string> = new Set();
  /** Temporarily excluded files for each sub-wiki watcher (by absolute path) */
  private subWikiExcludedFiles: Map<string, Set<string>> = new Map();

  /**
   * Set the main wiki path
   */
  setMainWikiPath(path: string): void {
    this.mainWikiPath = path;
  }

  /**
   * Register a sub-wiki watcher
   */
  registerSubWiki(id: string, subWikiPath: string, watcher: nsfw.NSFW): void {
    this.subWikiMap.set(id, { id, path: subWikiPath, watcher });
    this.subWikiExcludedFiles.set(id, new Set());
  }

  /**
   * Unregister a sub-wiki watcher
   */
  unregisterSubWiki(id: string): void {
    this.subWikiMap.delete(id);
    this.subWikiExcludedFiles.delete(id);
  }

  /**
   * Get all sub-wiki information
   */
  getSubWikis(): ISubWikiInfo[] {
    return Array.from(this.subWikiMap.values());
  }

  /**
   * Check if an absolute file path belongs to a sub-wiki
   * @returns Sub-wiki info if file is in a sub-wiki, undefined otherwise
   */
  getSubWikiForFile(absoluteFilePath: string): ISubWikiInfo | undefined {
    for (const subWiki of this.subWikiMap.values()) {
      if (absoluteFilePath.startsWith(subWiki.path)) {
        return subWiki;
      }
    }
    return undefined;
  }

  /**
   * Calculate relative path for a file based on which wiki it belongs to
   * @param absoluteFilePath Absolute file path
   * @returns Object containing the relative path and which watcher it belongs to
   */
  getRelativePathInfo(absoluteFilePath: string): { relativePath: string; watcherType: 'main' | 'sub'; subWikiId?: string } {
    // Check if file belongs to a sub-wiki first
    const subWiki = this.getSubWikiForFile(absoluteFilePath);
    if (subWiki) {
      return {
        relativePath: path.relative(subWiki.path, absoluteFilePath),
        watcherType: 'sub',
        subWikiId: subWiki.id,
      };
    }

    // Otherwise, it belongs to main wiki
    return {
      relativePath: path.relative(this.mainWikiPath, absoluteFilePath),
      watcherType: 'main',
    };
  }

  /**
   * Set or update tiddler information for a file path
   */
  set(filePath: string, fileDescriptor: IBootFilesIndexItemWithTitle): void {
    this.index.set(filePath, fileDescriptor);
  }

  /**
   * Get tiddler information by file path
   * @returns The file descriptor or undefined if not found
   */
  get(filePath: string): IBootFilesIndexItemWithTitle | undefined {
    return this.index.get(filePath);
  }

  /**
   * Check if a file path exists in the index
   */
  has(filePath: string): boolean {
    return this.index.has(filePath);
  }

  /**
   * Remove a file path from the index
   */
  delete(filePath: string): boolean {
    return this.index.delete(filePath);
  }

  /**
   * Get tiddler title by file path
   * @throws Error if file path not found in index
   */
  getTitleByPath(filePath: string): string {
    const item = this.index.get(filePath);
    if (!item) {
      throw new Error(`${filePath}\n↑ not existed in InverseFilesIndex`);
    }
    return item.tiddlerTitle;
  }

  /**
   * Clear all entries from the index
   */
  clear(): void {
    this.index.clear();
  }

  /**
   * Get the number of entries in the index
   */
  get size(): number {
    return this.index.size;
  }

  /**
   * Iterate over all entries
   */
  entries(): IterableIterator<[string, IBootFilesIndexItemWithTitle]> {
    return this.index.entries();
  }

  /**
   * Iterate over all file paths
   */
  keys(): IterableIterator<string> {
    return this.index.keys();
  }

  /**
   * Iterate over all file descriptors
   */
  values(): IterableIterator<IBootFilesIndexItemWithTitle> {
    return this.index.values();
  }

  /**
   * Add a file to the exclusion list for the appropriate watcher
   * @param absoluteFilePath Absolute file path to exclude
   */
  excludeFile(absoluteFilePath: string): void {
    const subWiki = this.getSubWikiForFile(absoluteFilePath);
    if (subWiki) {
      // File belongs to sub-wiki
      const excluded = this.subWikiExcludedFiles.get(subWiki.id);
      if (excluded) {
        excluded.add(absoluteFilePath);
      }
    } else {
      // File belongs to main wiki
      this.mainExcludedFiles.add(absoluteFilePath);
    }
  }

  /**
   * Remove a file from the exclusion list
   * @param absoluteFilePath Absolute file path to include
   */
  includeFile(absoluteFilePath: string): void {
    const subWiki = this.getSubWikiForFile(absoluteFilePath);
    if (subWiki) {
      // File belongs to sub-wiki
      const excluded = this.subWikiExcludedFiles.get(subWiki.id);
      if (excluded) {
        excluded.delete(absoluteFilePath);
      }
    } else {
      // File belongs to main wiki
      this.mainExcludedFiles.delete(absoluteFilePath);
    }
  }

  /**
   * Check if a file is temporarily excluded from the main watcher
   * @param absoluteFilePath Absolute file path to check
   * @returns True if the file is excluded
   */
  isMainFileExcluded(absoluteFilePath: string): boolean {
    return this.mainExcludedFiles.has(absoluteFilePath);
  }

  /**
   * Check if a file is temporarily excluded from a sub-wiki watcher
   * @param subWikiId Sub-wiki ID
   * @param absoluteFilePath Absolute file path to check
   * @returns True if the file is excluded
   */
  isSubWikiFileExcluded(subWikiId: string, absoluteFilePath: string): boolean {
    const excluded = this.subWikiExcludedFiles.get(subWikiId);
    return excluded ? excluded.has(absoluteFilePath) : false;
  }
}
