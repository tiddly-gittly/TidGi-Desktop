/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { workspace } from '@services/wiki/wikiWorker/services';
import fs from 'fs';
import nsfw from 'nsfw';
import path from 'path';
import type { FileInfo } from 'tiddlywiki';
import type { Tiddler, Wiki } from 'tiddlywiki';
import { FileSystemAdaptor, type IFileSystemAdaptorCallback } from './FileSystemAdaptor';
import { getActionName } from './utilities';

type IBootFilesIndexItemWithTitle = FileInfo & { tiddlerTitle: string };

/**
 * Enhanced filesystem adaptor that extends FileSystemAdaptor with file watching capabilities.
 *
 * Architecture:
 * 1. When wiki saves/deletes tiddlers:
 *    - saveTiddler/deleteTiddler calls excludeFile() to add file to watcher's excludedPaths
 *    - watcher.updateExcludedPaths() is called to dynamically exclude the file from watching
 *    - Perform file write/delete operation (file changes are not detected by nsfw)
 *    - Update inverseFilesIndex immediately after successful operation
 *    - Call includeFile() after a short delay to remove file from excludedPaths
 *    - File is re-included in watching, ready to detect external changes
 *
 * 2. When external changes occur:
 *    - nsfw detects file changes (only for non-excluded files)
 *    - Load file and sync to wiki via addTiddler/deleteTiddler
 *    - Update inverseFilesIndex to track the change
 *
 * This approach uses nsfw's native updateExcludedPaths() API for precise, per-file exclusion.
 * Unlike pause/resume (which blocks all events) or mutex locks (which require checking every event),
 * this method dynamically adjusts the watcher's exclusion list to prevent events at the source.
 * This ensures user's concurrent external file modifications are still detected while our own operations are ignored.
 */
class WatchFileSystemAdaptor extends FileSystemAdaptor {
  name = 'watch-filesystem';
  /** Inverse index: filepath -> tiddler info for fast lookup */
  private inverseFilesIndex: Record<string, IBootFilesIndexItemWithTitle> = {};
  /** NSFW watcher instance */
  private watcher: nsfw.NSFW | undefined;
  /** Base excluded paths (permanent) */
  private baseExcludedPaths: string[] = [];
  /** Temporarily excluded files being modified by wiki */
  private temporarilyExcludedFiles: Set<string> = new Set();

  constructor(options: { boot?: typeof $tw.boot; wiki: Wiki }) {
    super(options);
    this.logger = new $tw.utils.Logger('watch-filesystem', { colour: 'purple' });

    // Initialize file watching
    void this.initializeFileWatching();
  }

  /**
   * Save a tiddler to the filesystem (with file watching support)
   */
  override async saveTiddler(tiddler: Tiddler, callback: IFileSystemAdaptorCallback, options?: { tiddlerInfo?: Record<string, unknown> }): Promise<void> {
    let fileRelativePath: string | null = null;

    try {
      // Get file info to calculate relative path for watching
      const fileInfo = await this.getTiddlerFileInfo(tiddler);
      if (!fileInfo) {
        callback(new Error('No fileInfo returned from getTiddlerFileInfo'));
        return;
      }

      fileRelativePath = path.relative(this.watchPathBase, fileInfo.filepath);

      // Exclude file from watching during save
      await this.excludeFile(fileRelativePath);

      // Call parent's saveTiddler to handle the actual save
      await new Promise<void>((resolve, reject) => {
        void super.saveTiddler(tiddler, (error, result) => {
          if (error) {
            reject(error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error'));
          } else {
            // Update inverse index after successful save
            const finalFileInfo = this.boot.files[tiddler.fields.title];
            this.updateInverseIndex(fileRelativePath!, {
              ...finalFileInfo,
              filepath: fileRelativePath!,
              tiddlerTitle: tiddler.fields.title,
            });
            callback(null, result);
            resolve();
          }
        }, options);
      });

      // Re-include the file after a short delay
      setTimeout(() => {
        if (fileRelativePath) {
          void this.includeFile(fileRelativePath);
        }
      }, 200);
    } catch (error) {
      // Re-include the file on error
      if (fileRelativePath) {
        const pathToInclude = fileRelativePath;
        setTimeout(() => {
          void this.includeFile(pathToInclude);
        }, 200);
      }
      callback(error as Error);
    }
  }

  /**
   * Delete a tiddler from the filesystem (with file watching support)
   */
  override async deleteTiddler(title: string, callback: IFileSystemAdaptorCallback, _options?: unknown): Promise<void> {
    const fileInfo = this.boot.files[title];

    if (!fileInfo) {
      callback(null, null);
      return;
    }

    // Calculate relative path for watching
    const fileRelativePath = path.relative(this.watchPathBase, fileInfo.filepath);

    try {
      // Exclude file before deletion
      await this.excludeFile(fileRelativePath);

      // Call parent's deleteTiddler to handle the actual deletion
      await new Promise<void>((resolve, reject) => {
        void super.deleteTiddler(title, (error, result) => {
          if (error) {
            const errorObject = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
            reject(errorObject);
          } else {
            // Update inverse index after successful deletion
            this.updateInverseIndex(fileRelativePath, undefined);
            callback(null, result);
            resolve();
          }
        }, _options);
      });

      // Re-include the file after a delay (cleanup the exclusion list)
      setTimeout(() => {
        void this.includeFile(fileRelativePath);
      }, 200);
    } catch {
      // Re-include the file on error
      setTimeout(() => {
        void this.includeFile(fileRelativePath);
      }, 200);
      // Error already passed to callback in parent's deleteTiddler
    }
  }

  /**
   * Initialize file system watching
   */
  private async initializeFileWatching(): Promise<void> {
    if (!this.watchPathBase) {
      return;
    }

    // Check if file system watch is enabled for this workspace
    if (this.workspaceID) {
      try {
        const currentWorkspace = await workspace.get(this.workspaceID);
        if (currentWorkspace && 'enableFileSystemWatch' in currentWorkspace && !currentWorkspace.enableFileSystemWatch) {
          this.logger.log('[WATCH_FS_DISABLED] File system watching is disabled for this workspace');
          return;
        }
      } catch (error) {
        this.logger.alert('[WATCH_FS_ERROR] Failed to check enableFileSystemWatch setting:', error);
        return;
      }
    }

    // Initialize inverse index from boot.files
    this.initializeInverseFilesIndex();

    // Setup base excluded paths (permanent exclusions)
    this.baseExcludedPaths = [
      path.join(this.watchPathBase, 'subwiki'),
      path.join(this.watchPathBase, '.git'),
      path.join(this.watchPathBase, '$__StoryList'),
      path.join(this.watchPathBase, '.DS_Store'),
    ];

    // Setup nsfw watcher
    try {
      this.watcher = await nsfw(
        this.watchPathBase,
        (events) => {
          this.handleNsfwEvents(events);
        },
        {
          debounceMS: 100,
          errorCallback: (error) => {
            this.logger.alert('[WATCH_FS_ERROR] NSFW error:', error);
          },
          // Start with base excluded paths
          // @ts-expect-error - nsfw types are incorrect, it accepts string[] not just [string]
          excludedPaths: [...this.baseExcludedPaths],
        },
      );

      // Start watching
      await this.watcher.start();

      this.logger.log('[WATCH_FS_READY] Filesystem watcher is ready');
      this.logger.log('[WATCH_FS_READY] Watching path:', this.watchPathBase);

      // Log stabilization marker for tests
      this.logger.log('[test-id-WATCH_FS_STABILIZED] Watcher has stabilized');
    } catch (error) {
      this.logger.alert('[WATCH_FS_ERROR] Failed to initialize file watching:', error);
    }
  }

  /**
   * Initialize the inverse files index from boot.files
   */
  private initializeInverseFilesIndex(): void {
    const initialLoadedFiles = this.boot.files;
    // Initialize the inverse index
    for (const tiddlerTitle in initialLoadedFiles) {
      if (Object.hasOwn(initialLoadedFiles, tiddlerTitle)) {
        const fileDescriptor = initialLoadedFiles[tiddlerTitle];
        const fileRelativePath = path.relative(this.watchPathBase, fileDescriptor.filepath);
        this.inverseFilesIndex[fileRelativePath] = { ...fileDescriptor, filepath: fileRelativePath, tiddlerTitle };
      }
    }
  }

  /**
   * Update watcher's excluded paths with current temporary exclusions
   */
  private async updateWatcherExcludedPaths(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    // Combine base excluded paths with temporarily excluded files
    const allExcludedPaths = [
      ...this.baseExcludedPaths,
      ...Array.from(this.temporarilyExcludedFiles).map(relativePath => path.join(this.watchPathBase, relativePath)),
    ];

    // @ts-expect-error - nsfw types are incorrect, it accepts string[] not just [string]
    await this.watcher.updateExcludedPaths(allExcludedPaths);
  }

  /**
   * Temporarily exclude a file from watching (e.g., during save/delete)
   */
  private async excludeFile(fileRelativePath: string): Promise<void> {
    this.temporarilyExcludedFiles.add(fileRelativePath);
    await this.updateWatcherExcludedPaths();
  }

  /**
   * Remove a file from temporary exclusions
   */
  private async includeFile(fileRelativePath: string): Promise<void> {
    this.temporarilyExcludedFiles.delete(fileRelativePath);
    await this.updateWatcherExcludedPaths();
  }

  /**
   * Update inverse index
   */
  private updateInverseIndex(filePath: string, fileDescriptor: IBootFilesIndexItemWithTitle | undefined): void {
    if (fileDescriptor) {
      this.inverseFilesIndex[filePath] = fileDescriptor;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.inverseFilesIndex[filePath];
    }
  }

  /**
   * Check if file path exists in index
   */
  private filePathExistsInIndex(filePath: string): boolean {
    return Boolean(this.inverseFilesIndex[filePath]);
  }

  /**
   * Get tiddler title by file path
   */
  private getTitleByPath(filePath: string): string {
    try {
      return this.inverseFilesIndex[filePath].tiddlerTitle;
    } catch {
      // fatal error, shutting down.
      if (this.watcher) {
        void this.watcher.stop();
      }
      throw new Error(`${filePath}\n↑ not existed in watch-fs plugin's FileSystemMonitor's this.inverseFilesIndex`);
    }
  }

  /**
   * Handle NSFW file system change events
   */
  private handleNsfwEvents(events: nsfw.FileChangeEvent[]): void {
    for (const event of events) {
      const { action, directory } = event;

      // Get file name from event
      let fileName = '';
      if ('file' in event) {
        fileName = event.file;
      } else if ('newFile' in event) {
        fileName = event.newFile;
      }

      // Compute relative and absolute paths
      const fileAbsolutePath = path.join(directory, fileName);
      const fileRelativePath = path.relative(this.watchPathBase, fileAbsolutePath);

      const fileNameBase = path.parse(fileAbsolutePath).name;
      const fileExtension = path.extname(fileRelativePath);
      const fileMimeType = $tw.utils.getFileExtensionInfo(fileExtension)?.type ?? 'text/vnd.tiddlywiki';
      const metaFileAbsolutePath = `${fileAbsolutePath}.meta`;

      this.logger.log('[WATCH_FS_EVENT]', getActionName(action), fileName);

      // Handle different event types
      if (action === nsfw.actions.CREATED || action === nsfw.actions.MODIFIED) {
        this.handleFileAddOrChange(
          fileAbsolutePath,
          fileRelativePath,
          metaFileAbsolutePath,
          fileName,
          fileNameBase,
          fileExtension,
          fileMimeType,
          action === nsfw.actions.CREATED ? 'add' : 'change',
        );
      } else if (action === nsfw.actions.DELETED) {
        this.handleFileDelete(fileAbsolutePath, fileRelativePath, fileExtension);
      } else if (action === nsfw.actions.RENAMED) {
        // NSFW provides rename events with oldFile/newFile
        // Handle as delete old + create new
        if ('oldFile' in event && 'newFile' in event) {
          const oldFileAbsPath = path.join(directory, event.oldFile);
          const oldFileRelativePath = path.relative(this.watchPathBase, oldFileAbsPath);
          const oldFileExtension = path.extname(oldFileRelativePath);
          this.handleFileDelete(oldFileAbsPath, oldFileRelativePath, oldFileExtension);

          const newDirectory = 'newDirectory' in event ? event.newDirectory : directory;
          const newFileAbsPath = path.join(newDirectory, event.newFile);
          const newFileRelativePath = path.relative(this.watchPathBase, newFileAbsPath);
          const newFileName = event.newFile;
          const newFileNameBase = path.parse(newFileAbsPath).name;
          const newFileExtension = path.extname(newFileRelativePath);
          const newFileMimeType = $tw.utils.getFileExtensionInfo(newFileExtension)?.type ?? 'text/vnd.tiddlywiki';
          const newMetaFileAbsPath = `${newFileAbsPath}.meta`;

          this.handleFileAddOrChange(
            newFileAbsPath,
            newFileRelativePath,
            newMetaFileAbsPath,
            newFileName,
            newFileNameBase,
            newFileExtension,
            newFileMimeType,
            'add',
          );
        }
      }
    }
  }

  /**
   * Handle file add or change events
   */
  private handleFileAddOrChange(
    fileAbsolutePath: string,
    fileRelativePath: string,
    metaFileAbsolutePath: string,
    fileName: string,
    fileNameBase: string,
    fileExtension: string,
    fileMimeType: string,
    changeType: 'add' | 'change',
  ): void {
    // For .meta files, we need to load the corresponding base file
    let actualFileToLoad = fileAbsolutePath;
    let actualFileRelativePath = fileRelativePath;
    if (fileExtension === '.meta') {
      // Remove .meta extension to get the actual file path
      actualFileToLoad = fileAbsolutePath.slice(0, -5); // Remove '.meta'
      actualFileRelativePath = fileRelativePath.slice(0, -5); // Remove '.meta'
    }

    // Get tiddler from disk
    let tiddlersDescriptor: ReturnType<typeof $tw.loadTiddlersFromFile>;
    try {
      tiddlersDescriptor = $tw.loadTiddlersFromFile(actualFileToLoad);
    } catch (error) {
      this.logger.alert('[WATCH_FS_LOAD_ERROR] Failed to load file:', actualFileToLoad, error);
      return;
    }

    // Create .meta file for non-tiddler files (images, videos, etc.)
    // For files without .meta, TiddlyWiki needs metadata to properly index them
    const ignoredExtension = ['tid', 'json', 'meta'];
    const isCreatingNewNonTiddlerFile = changeType === 'add' && !fs.existsSync(metaFileAbsolutePath) && !ignoredExtension.includes(fileExtension.slice(1));
    if (isCreatingNewNonTiddlerFile) {
      const createdTime = $tw.utils.formatDateString(new Date(), '[UTC]YYYY0MM0DD0hh0mm0ss0XXX');
      fs.writeFileSync(
        metaFileAbsolutePath,
        `caption: ${fileNameBase}\ncreated: ${createdTime}\nmodified: ${createdTime}\ntitle: ${fileName}\ntype: ${fileMimeType}\n`,
      );
      // After creating .meta, continue to process the file normally
      // TiddlyWiki will detect the .meta file on next event
    }

    const { tiddlers, ...fileDescriptor } = tiddlersDescriptor;

    // Process each tiddler from the file
    tiddlers.forEach((tiddler) => {
      // Note: $tw.loadTiddlersFromFile returns tiddlers as plain objects with fields at top level,
      // not wrapped in a .fields property
      const tiddlerTitle = tiddler?.title;
      if (!tiddlerTitle) {
        this.logger.alert(`[WATCH_FS_ERROR] Tiddler has no title`);
        return;
      }

      const isNewFile = !this.filePathExistsInIndex(actualFileRelativePath);

      // Update inverse index first
      this.updateInverseIndex(actualFileRelativePath, {
        ...fileDescriptor,
        filepath: actualFileRelativePath,
        tiddlerTitle,
      } as IBootFilesIndexItemWithTitle);

      // Add tiddler to wiki (this will update if it exists or add if new)

      $tw.syncadaptor!.wiki.addTiddler(tiddler);

      // Log appropriate event
      if (isNewFile) {
        this.logger.log(`[test-id-WATCH_FS_TIDDLER_ADDED] ${tiddlerTitle}`);
      } else {
        this.logger.log(`[test-id-WATCH_FS_TIDDLER_UPDATED] ${tiddlerTitle}`);
      }
    });
  }

  /**
   * Handle file delete events
   */
  private handleFileDelete(fileAbsolutePath: string, fileRelativePath: string, _fileExtension: string): void {
    // Try to get tiddler title from filepath
    // If file is not in index, try to extract title from filename
    let tiddlerTitle: string;

    if (this.filePathExistsInIndex(fileRelativePath)) {
      // File is in our inverse index
      tiddlerTitle = this.getTitleByPath(fileRelativePath);
    } else {
      // File not in index - try to extract title from filename
      // This handles edge cases like manually deleted files or index inconsistencies
      const fileNameWithoutExtension = path.basename(fileRelativePath, path.extname(fileRelativePath));
      tiddlerTitle = fileNameWithoutExtension;
    }

    // Check if tiddler exists in wiki before trying to delete
    if (!$tw.syncadaptor!.wiki.tiddlerExists(tiddlerTitle)) {
      // Tiddler doesn't exist in wiki, nothing to delete
      return;
    }

    // Remove tiddler from wiki
    this.removeTiddlerFileInfo(tiddlerTitle);

    // Delete the tiddler from wiki to trigger change event
    $tw.syncadaptor!.wiki.deleteTiddler(tiddlerTitle);
    this.logger.log(`[test-id-WATCH_FS_TIDDLER_DELETED] ${tiddlerTitle}`);

    // Delete system tiddler empty file if exists
    try {
      if (
        fileAbsolutePath.startsWith('$') &&
        fs.existsSync(fileAbsolutePath) &&
        fs.readFileSync(fileAbsolutePath, 'utf-8').length === 0
      ) {
        fs.unlinkSync(fileAbsolutePath);
      }
    } catch (error) {
      this.logger.alert('Error cleaning up empty file:', error);
    }

    // Update inverse index
    this.updateInverseIndex(fileRelativePath, undefined);
  }

  /**
   * Cleanup method to properly close watcher when wiki is shutting down
   */
  public async cleanup(): Promise<void> {
    if (this.watcher) {
      this.logger.log('[WATCH_FS_CLEANUP] Closing filesystem watcher');
      await this.watcher.stop();
      this.watcher = undefined;
      this.logger.log('[WATCH_FS_CLEANUP] Filesystem watcher closed');
    }
  }
}

// Only export in Node.js environment
if ($tw.node) {
  exports.adaptorClass = WatchFileSystemAdaptor;
}
