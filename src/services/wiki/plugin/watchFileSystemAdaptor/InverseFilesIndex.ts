import type { FileInfo } from 'tiddlywiki';

export type IBootFilesIndexItemWithTitle = FileInfo & { tiddlerTitle: string };

/**
 * Inverse index for mapping file paths to tiddler information.
 * Uses Map for better performance with frequent add/delete operations.
 *
 * This index enables O(1) lookups of tiddler information by file path,
 * which is critical for the file watcher to efficiently process file change events.
 */
export class InverseFilesIndex {
  private index: Map<string, IBootFilesIndexItemWithTitle> = new Map();

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
}
