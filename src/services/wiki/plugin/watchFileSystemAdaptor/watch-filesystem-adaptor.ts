/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { Logger } from '$:/core/modules/utils/logger.js';
import type { FileInfo } from '$:/core/modules/utils/utils.js';
import { workspace } from '@services/wiki/wikiWorker/services';
import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import { backOff } from 'exponential-backoff';
import fs from 'fs';
import nsfw from 'nsfw';
import path from 'path';
import type { Tiddler, Wiki } from 'tiddlywiki';

type IFileSystemAdaptorCallback = (error: Error | null | string, fileInfo?: FileInfo | null) => void;

type IBootFilesIndexItemWithTitle = FileInfo & { tiddlerTitle: string };

/**
 * Get human-readable action name from nsfw action code
 */
function getActionName(action: number): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (action === nsfw.actions.CREATED) {
    return 'add';
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (action === nsfw.actions.DELETED) {
    return 'unlink';
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (action === nsfw.actions.MODIFIED) {
    return 'change';
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (action === nsfw.actions.RENAMED) {
    return 'rename';
  }
  return 'unknown';
}

/**
 * Check if error is a file lock error that should be retried
 */
function isFileLockError(errorCode: string | undefined): boolean {
  return errorCode === 'EBUSY' || errorCode === 'EPERM' || errorCode === 'EACCES' || errorCode === 'EAGAIN';
}

/**
 * Enhanced filesystem adaptor that routes tiddlers to sub-wikis based on tags.
 * Queries workspace information from main process via worker IPC.
 *
 * Unlike the original approach that modifies $:/config/FileSystemPaths with complex string manipulation,
 * this adaptor directly checks tiddler tags against workspace tagName and routes to appropriate directories.
 *
 * Also watches filesystem for external changes and syncs them back to wiki.
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
class WatchFileSystemAdaptor {
  name = 'watch-filesystem';
  supportsLazyLoading = false;
  wiki: Wiki;
  boot: typeof $tw.boot;
  logger: Logger;
  workspaceID: string;
  private subWikisWithTag: IWikiWorkspace[] = [];
  /** Map of tagName -> subWiki for O(1) tag lookup instead of O(n) find */
  private tagNameToSubWiki: Map<string, IWikiWorkspace> = new Map();
  /** Cached extension filters from $:/config/FileSystemExtensions. Requires restart to reflect changes. */
  private extensionFilters: string[] | undefined;

  // File watching properties
  private watchPathBase!: string;
  /** Inverse index: filepath -> tiddler info for fast lookup */
  private inverseFilesIndex: Record<string, IBootFilesIndexItemWithTitle> = {};
  /** NSFW watcher instance */
  private watcher: nsfw.NSFW | undefined;
  /** Base excluded paths (permanent) */
  private baseExcludedPaths: string[] = [];
  /** Temporarily excluded files being modified by wiki */
  private temporarilyExcludedFiles: Set<string> = new Set();

  constructor(options: { boot?: typeof $tw.boot; wiki: Wiki }) {
    this.wiki = options.wiki;
    this.boot = options.boot ?? $tw.boot;
    this.logger = new $tw.utils.Logger('watch-filesystem', { colour: 'purple' });

    if (!$tw.node) {
      throw new Error('watch-filesystem adaptor only works in Node.js environment');
    }

    // Get workspace ID from preloaded tiddler
    this.workspaceID = this.wiki.getTiddlerText('$:/info/tidgi/workspaceID', '');

    if (this.boot.wikiTiddlersPath) {
      $tw.utils.createDirectory(this.boot.wikiTiddlersPath);
      this.watchPathBase = path.resolve(this.boot.wikiTiddlersPath);
    } else {
      this.logger.alert('watch-filesystem: wikiTiddlersPath is not set!');
      this.watchPathBase = '';
    }

    // Initialize extension filters cache (cached for performance, requires restart to reflect changes)
    this.initializeExtensionFiltersCache();

    // Initialize sub-wikis cache
    void this.updateSubWikisCache();

    // Initialize file watching
    void this.initializeFileWatching();
  }

  /**
   * Initialize and cache extension filters from $:/config/FileSystemExtensions.
   * These filters are cached at startup for performance.
   * Note: Changes to $:/config/FileSystemExtensions require restarting the wiki server to take effect.
   */
  private initializeExtensionFiltersCache(): void {
    if (this.wiki.tiddlerExists('$:/config/FileSystemExtensions')) {
      const extensionFiltersText = this.wiki.getTiddlerText('$:/config/FileSystemExtensions', '');
      this.extensionFilters = extensionFiltersText.split('\n').filter(line => line.trim().length > 0);
    }
  }

  /**
   * Update the cached sub-wikis list and rebuild tag lookup map
   */
  private async updateSubWikisCache(): Promise<void> {
    try {
      if (!this.workspaceID) {
        this.subWikisWithTag = [];
        this.tagNameToSubWiki.clear();
        return;
      }

      const currentWorkspace = await workspace.get(this.workspaceID);
      if (!currentWorkspace) {
        this.subWikisWithTag = [];
        this.tagNameToSubWiki.clear();
        return;
      }

      const allWorkspaces = await workspace.getWorkspacesAsList();

      // Filter to only include sub-wikis that have both tagName and wikiFolderLocation for tag-based routing
      const subWikisWithTag = allWorkspaces.filter((workspaceItem: IWorkspace) =>
        'isSubWiki' in workspaceItem &&
        workspaceItem.isSubWiki &&
        workspaceItem.mainWikiID === currentWorkspace.id &&
        'tagName' in workspaceItem &&
        workspaceItem.tagName &&
        'wikiFolderLocation' in workspaceItem &&
        workspaceItem.wikiFolderLocation
      ) as IWikiWorkspace[];

      this.subWikisWithTag = subWikisWithTag;

      // Rebuild tag name to sub-wiki map for O(1) lookup
      this.tagNameToSubWiki.clear();
      for (const subWiki of subWikisWithTag) {
        this.tagNameToSubWiki.set(subWiki.tagName!, subWiki);
      }
    } catch (error) {
      this.logger.alert('watch-filesystem: Failed to update sub-wikis cache:', error);
    }
  }

  isReady(): boolean {
    return true;
  }

  getTiddlerInfo(tiddler: Tiddler): FileInfo | undefined {
    const title = tiddler.fields.title;
    return this.boot.files[title];
  }

  /**
   * Main routing logic: determine where a tiddler should be saved based on its tags.
   * If tiddler has a tag that matches a sub-wiki's tagName, route it to that sub-wiki.
   * Otherwise, use the default FileSystemPaths logic.
   */
  async getTiddlerFileInfo(tiddler: Tiddler): Promise<FileInfo | null> {
    if (!this.boot.wikiTiddlersPath) {
      throw new Error('watch-filesystem adaptor requires a valid wiki folder');
    }

    const title = tiddler.fields.title;
    const tags = tiddler.fields.tags ?? [];
    const fileInfo = this.boot.files[title];

    try {
      // Find matching sub-wiki by checking tags against cached tag->subWiki map (O(tags.length))
      let matchingSubWiki: IWikiWorkspace | undefined;
      for (const tag of tags) {
        matchingSubWiki = this.tagNameToSubWiki.get(tag);
        if (matchingSubWiki) {
          break;
        }
      }

      if (matchingSubWiki) {
        // Route to sub-wiki
        return this.generateSubWikiFileInfo(tiddler, matchingSubWiki, fileInfo);
      } else {
        // Use default FileSystemPaths logic
        return this.generateDefaultFileInfo(tiddler, fileInfo);
      }
    } catch (error) {
      this.logger.alert(`watch-filesystem: Error in getTiddlerFileInfo for "${title}":`, error);
      // Fall back to default logic on error
      return this.generateDefaultFileInfo(tiddler, fileInfo);
    }
  }

  /**
   * Generate file info for sub-wiki directory
   */
  private generateSubWikiFileInfo(tiddler: Tiddler, subWiki: IWikiWorkspace, fileInfo: FileInfo | undefined): FileInfo {
    // Save directly to sub-wiki folder, not to tiddlers subfolder
    const targetDirectory = subWiki.wikiFolderLocation;

    // Ensure target directory exists
    $tw.utils.createDirectory(targetDirectory);

    return $tw.utils.generateTiddlerFileInfo(tiddler, {
      directory: targetDirectory,
      pathFilters: undefined, // Don't use pathFilters for sub-wiki routing
      extFilters: this.extensionFilters,
      wiki: this.wiki,
      fileInfo: fileInfo ? { ...fileInfo, overwrite: true } : { overwrite: true } as FileInfo,
    });
  }

  /**
   * Generate file info using default FileSystemPaths logic
   */
  private generateDefaultFileInfo(tiddler: Tiddler, fileInfo: FileInfo | undefined): FileInfo {
    let pathFilters: string[] | undefined;

    if (this.wiki.tiddlerExists('$:/config/FileSystemPaths')) {
      const pathFiltersText = this.wiki.getTiddlerText('$:/config/FileSystemPaths', '');
      pathFilters = pathFiltersText.split('\n').filter(line => line.trim().length > 0);
    }

    return $tw.utils.generateTiddlerFileInfo(tiddler, {
      directory: this.boot.wikiTiddlersPath ?? '',
      pathFilters,
      extFilters: this.extensionFilters,
      wiki: this.wiki,
      fileInfo: fileInfo ? { ...fileInfo, overwrite: true } : { overwrite: true } as FileInfo,
    });
  }

  /**
   * Save a tiddler to the filesystem
   */
  async saveTiddler(tiddler: Tiddler, callback: IFileSystemAdaptorCallback, options?: { tiddlerInfo?: Record<string, unknown> }): Promise<void> {
    const title = tiddler.fields.title;
    let fileInfo: FileInfo | null = null;
    let fileRelativePath: string | null = null;

    try {
      // Get file info directly
      fileInfo = await this.getTiddlerFileInfo(tiddler);

      if (!fileInfo) {
        callback(new Error('No fileInfo returned from getTiddlerFileInfo'));
        return;
      }

      // Calculate relative path for logging
      fileRelativePath = path.relative(this.watchPathBase, fileInfo.filepath);

      // Exclude this file from watching during save
      await this.excludeFile(fileRelativePath);

      // Save tiddler to file with retry logic for file lock errors
      const savedFileInfo = await this.saveTiddlerWithRetry(tiddler, fileInfo);

      // Store new boot info only after successful writes
      // Ensure isEditableFile is set (required by IBootFilesIndexItem)
      this.boot.files[tiddler.fields.title] = {
        ...savedFileInfo,
        isEditableFile: savedFileInfo.isEditableFile ?? true,
      };

      // Now do cleanup after file is written
      await new Promise<void>((resolve, reject) => {
        const cleanupOptions = {
          adaptorInfo: options?.tiddlerInfo as FileInfo | undefined,
          bootInfo: this.boot.files[tiddler.fields.title],
          title: tiddler.fields.title,
        };
        $tw.utils.cleanupTiddlerFiles(cleanupOptions, (cleanupError: Error | null, _cleanedFileInfo?: FileInfo) => {
          if (cleanupError) {
            reject(cleanupError);
            return;
          }

          resolve();
        });
      });

      // Update inverse index after successful save
      const finalFileInfo = this.boot.files[tiddler.fields.title];
      this.updateInverseIndex(fileRelativePath, {
        ...finalFileInfo,
        filepath: fileRelativePath,
        tiddlerTitle: title,
      });

      // Re-include the file after a short delay to allow filesystem to settle
      setTimeout(() => {
        if (fileRelativePath) {
          void this.includeFile(fileRelativePath);
        }
      }, 200);

      // Call the original callback with success
      callback(null, this.boot.files[tiddler.fields.title]);
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
   * Load a tiddler - not needed as all tiddlers are loaded during boot
   */
  loadTiddler(_title: string, callback: IFileSystemAdaptorCallback): void {
    callback(null, null);
  }

  /**
   * Delete a tiddler from the filesystem
   */
  async deleteTiddler(title: string, callback: IFileSystemAdaptorCallback, _options?: unknown): Promise<void> {
    const fileInfo = this.boot.files[title];

    if (!fileInfo) {
      callback(null, null);
      return;
    }

    // Calculate relative path
    const fileRelativePath = path.relative(this.watchPathBase, fileInfo.filepath);

    try {
      // Exclude file before deletion
      await this.excludeFile(fileRelativePath);

      await new Promise<void>((resolve, reject) => {
        $tw.utils.deleteTiddlerFile(fileInfo, (error: Error | null, deletedFileInfo?: FileInfo) => {
          if (error) {
            const errorCode = (error as NodeJS.ErrnoException).code;
            const errorSyscall = (error as NodeJS.ErrnoException).syscall;
            if ((errorCode === 'EPERM' || errorCode === 'EACCES') && errorSyscall === 'unlink') {
              // Error deleting the file on disk, fail gracefully
              this.logger.alert(`Server desynchronized. Error deleting file for deleted tiddler "${title}"`);
              callback(null, deletedFileInfo);
              resolve();
            } else {
              reject(error);
            }
            return;
          }

          // Remove the tiddler from boot.files
          this.removeTiddlerFileInfo(title);
          
          // Update inverse index after successful deletion
          this.updateInverseIndex(fileRelativePath, undefined);
          
          callback(null, null);
          resolve();
        });
      });

      // Re-include the file after a delay (though it's deleted, cleanup the exclusion list)
      setTimeout(() => {
        void this.includeFile(fileRelativePath);
      }, 200);
    } catch (error) {
      // Re-include the file on error
      setTimeout(() => {
        void this.includeFile(fileRelativePath);
      }, 200);
      callback(error as Error);
    }
  }
  /**
   * Remove tiddler info from cache
   */
  removeTiddlerFileInfo(title: string): void {
    if (this.boot.files[title]) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.boot.files[title];
    }
  }

  /**
   * Create an info tiddler to notify user about file save errors
   */
  private createErrorNotification(title: string, error: Error, retryCount: number): void {
    const errorInfoTitle = `$:/temp/watch-fs/error/${title}`;
    const errorTiddler = {
      title: errorInfoTitle,
      text:
        `Failed to save tiddler "${title}" after ${retryCount} retries.\n\nError: ${error.message}\n\nThe file might be locked by another process. Please close any applications using this file and try again.`,
      tags: ['$:/tags/Alert'],
      type: 'text/vnd.tiddlywiki',
      'error-type': 'file-save-error',
      'original-title': title,
      timestamp: new Date().toISOString(),
    };

    this.wiki.addTiddler(errorTiddler);
    this.logger.alert(`watch-filesystem: Created error notification for "${title}"`);
  }

  /**
   * Save tiddler with exponential backoff retry for file lock errors
   */
  private async saveTiddlerWithRetry(
    tiddler: Tiddler,
    fileInfo: FileInfo,
    options: { maxRetries?: number; initialDelay?: number; maxDelay?: number } = {},
  ): Promise<FileInfo> {
    const maxRetries = options.maxRetries ?? 10;
    const initialDelay = options.initialDelay ?? 50;
    const maxDelay = options.maxDelay ?? 2000;

    try {
      return await backOff(
        async () => {
          return await new Promise<FileInfo>((resolve, reject) => {
            $tw.utils.saveTiddlerToFile(tiddler, fileInfo, (saveError: Error | null, savedFileInfo?: FileInfo) => {
              if (saveError) {
                reject(saveError);
                return;
              }
              if (!savedFileInfo) {
                reject(new Error('No fileInfo returned from saveTiddlerToFile'));
                return;
              }
              resolve(savedFileInfo);
            });
          });
        },
        {
          numOfAttempts: maxRetries,
          startingDelay: initialDelay,
          timeMultiple: 2,
          maxDelay,
          delayFirstAttempt: false,
          jitter: 'none',
          retry: (error: Error, attemptNumber: number) => {
            const errorCode = (error as NodeJS.ErrnoException).code;

            // Only retry on file lock errors
            if (isFileLockError(errorCode)) {
              this.logger.log(
                `watch-filesystem: File "${fileInfo.filepath}" is locked (${errorCode}), retrying (attempt ${attemptNumber}/${maxRetries})`,
              );
              return true;
            }

            // For other errors, don't retry
            this.logger.alert(`watch-filesystem: Error saving "${tiddler.fields.title}":`, error);
            this.createErrorNotification(tiddler.fields.title, error, attemptNumber);
            return false;
          },
        },
      );
    } catch (error) {
      // After all retries failed or non-retryable error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const finalError = new Error(`Failed to save "${tiddler.fields.title}": ${errorMessage}`);
      this.createErrorNotification(tiddler.fields.title, finalError, maxRetries);
      throw finalError;
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
    ].filter((excludePath) => {
      // Only include paths that exist or are always excluded
      // Some paths like .DS_Store might not exist yet but should always be excluded
      const isSystemFile = excludePath.endsWith('.DS_Store') || excludePath.endsWith('$__StoryList');
      if (isSystemFile) {
        return true;
      }
      try {
        return fs.existsSync(excludePath);
      } catch {
        return false;
      }
    });

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
    let tiddlersDescriptor: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tiddlers: any[];
      [key: string]: unknown;
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tiddlers.forEach((tiddler: any) => {
      const tiddlerTitle = tiddler.title as string;
      const isNewFile = !this.filePathExistsInIndex(actualFileRelativePath);

      // Update inverse index first
      this.updateInverseIndex(actualFileRelativePath, {
        ...fileDescriptor,
        filepath: actualFileRelativePath,
        tiddlerTitle,
      } as IBootFilesIndexItemWithTitle);

      // Add tiddler to wiki (this will update if it exists or add if new)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
