/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { Logger } from '$:/core/modules/utils/logger.js';
import type { FileInfo } from '$:/core/modules/utils/utils.js';
import { workspace } from '@services/wiki/wikiWorker/services';
import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import type { Tiddler, Wiki } from 'tiddlywiki';
import { deepEqual } from './deep-equal';
import { getTwCustomMimeType, toTWUTCString } from './utils';

type IFileSystemAdaptorCallback = (error: Error | null | string, fileInfo?: FileInfo | null) => void;

type IBootFilesIndexItemWithTitle = FileInfo & { tiddlerTitle: string };

/**
 * Enhanced filesystem adaptor that routes tiddlers to sub-wikis based on tags.
 * Queries workspace information from main process via worker IPC.
 *
 * Unlike the original approach that modifies $:/config/FileSystemPaths with complex string manipulation,
 * this adaptor directly checks tiddler tags against workspace tagName and routes to appropriate directories.
 *
 * Also watches filesystem for external changes and syncs them back to wiki.
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
  /** Mutex to ignore temporary file created or deleted by this plugin */
  private lockedFiles: Set<string> = new Set<string>();
  /** Chokidar watcher instance */
  private watcher: ReturnType<typeof chokidar.watch> | undefined;
  /** Track if watcher has stabilized by capturing first real file event */
  private watcherStabilized: boolean = false;

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
    this.initializeFileWatching();
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
      fileInfo,
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
      fileInfo,
    });
  }

  /**
   * Save a tiddler to the filesystem
   */
  async saveTiddler(tiddler: Tiddler, callback: IFileSystemAdaptorCallback, options?: { tiddlerInfo?: Record<string, unknown> }): Promise<void> {
    const title = tiddler.fields.title;

    try {
      // Get file info directly
      const fileInfo = await this.getTiddlerFileInfo(tiddler);

      if (!fileInfo) {
        callback(new Error('No fileInfo returned from getTiddlerFileInfo'));
        return;
      }

      // Save tiddler to file - wrap callback in Promise to ensure we wait
      await new Promise<FileInfo>((resolve, reject) => {
        $tw.utils.saveTiddlerToFile(tiddler, fileInfo, (saveError: Error | null, savedFileInfo?: FileInfo) => {
          if (saveError) {
            const errorCode = (saveError as NodeJS.ErrnoException).code;
            this.logger.alert(`watch-filesystem: Error saving "${title}":`, saveError);
            if (errorCode === 'EPERM' || errorCode === 'EACCES') {
              this.logger.alert('Error saving file, will be retried with encoded filepath', savedFileInfo ? encodeURIComponent(savedFileInfo.filepath) : 'unknown');
            }
            reject(saveError);
            return;
          }

          if (!savedFileInfo) {
            reject(new Error('No fileInfo returned from saveTiddlerToFile'));
            return;
          }

          // Store new boot info only after successful writes
          // Ensure isEditableFile is set (required by IBootFilesIndexItem)
          this.boot.files[tiddler.fields.title] = {
            ...savedFileInfo,
            isEditableFile: savedFileInfo.isEditableFile ?? true,
          };

          resolve(savedFileInfo);
        });
      });

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

      // Call the original callback with success
      callback(null, this.boot.files[tiddler.fields.title]);
    } catch (error) {
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

    try {
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
          callback(null, null);
          resolve();
        });
      });
    } catch (error) {
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
   * Initialize file system watching
   */
  private initializeFileWatching(): void {
    if (!this.watchPathBase) {
      return;
    }

    // Reset stabilization flag for new watcher instance
    this.watcherStabilized = false;

    // Initialize inverse index from boot.files
    this.initializeInverseFilesIndex();

    // Setup chokidar watcher
    this.watcher = chokidar.watch(this.watchPathBase, {
      ignoreInitial: true,
      ignored: [
        '**/$__StoryList*',
        '**/*_1.*', // sometimes sync logic bug will resulted in file ends with _1
        '**/subwiki/**',
        '**/.DS_Store',
        '**/.git',
      ],
      atomic: true,
    });

    // Listen for ready event
    this.watcher.on('ready', () => {
      this.logger.log('[WATCH_FS_READY] Filesystem watcher is ready');
      this.logger.log('[WATCH_FS_READY] Watching path:', this.watchPathBase);
      if (this.watcher) {
        this.logger.log('[WATCH_FS_READY] Watcher getWatched:', Object.keys(this.watcher.getWatched()).length, 'directories');
      }
    });

    // Setup file change listener
    this.setupListeners();
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
        void this.watcher.close();
      }
      throw new Error(`${filePath}\n↑ not existed in watch-fs plugin's FileSystemMonitor's this.inverseFilesIndex`);
    }
  }

  /**
   * Setup file system change listeners
   */
  private setupListeners(): void {
    if (!this.watcher) {
      return;
    }

    this.logger.log('[WATCH_FS_SETUP] Setting up file system listeners');

    const listener = (changeType: string, filePath: string, _stats?: fs.Stats): void => {
      const fileName = path.basename(filePath);
      this.logger.log('[WATCH_FS_EVENT]', changeType, fileName);

      // Only handle specific change types
      if (!['add', 'addDir', 'change', 'unlink', 'unlinkDir'].includes(changeType)) {
        return;
      }

      const fileRelativePath = path.relative(this.watchPathBase, filePath);
      const fileAbsolutePath = path.join(this.watchPathBase, fileRelativePath);
      const metaFileAbsolutePath = `${fileAbsolutePath}.meta`;
      const fileNameBase = path.parse(fileAbsolutePath).name;
      const fileExtension = path.extname(fileRelativePath);
      const fileMimeType = getTwCustomMimeType(fileExtension);

      // Mark watcher as stabilized after first real file event
      if (!this.watcherStabilized) {
        this.watcherStabilized = true;
        this.logger.log('[test-id-WATCH_FS_STABILIZED] Watcher has stabilized after capturing first file event');
      }

      // Check mutex lock
      if (this.lockedFiles.has(fileRelativePath)) {
        this.lockedFiles.delete(fileRelativePath);
        return;
      }

      // Handle add or change
      if (changeType === 'add' || changeType === 'change') {
        this.handleFileAddOrChange(
          fileAbsolutePath,
          fileRelativePath,
          metaFileAbsolutePath,
          fileName,
          fileNameBase,
          fileExtension,
          fileMimeType,
          changeType,
        );
      }

      // Handle delete
      if (changeType === 'unlink') {
        this.handleFileDelete(fileAbsolutePath, fileRelativePath, fileExtension);
      }
    };

    this.watcher.on('all', listener);
    this.logger.log('[WATCH_FS_SETUP] File system listeners registered');
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
    } catch (_error) {
      return;
    }

    // Create .meta file for non-tiddler files
    const ignoredExtension = ['tid', 'json', 'meta'];
    const isCreatingNewNonTiddlerFile = changeType === 'add' && !fs.existsSync(metaFileAbsolutePath) && !ignoredExtension.includes(fileExtension.slice(1));
    if (isCreatingNewNonTiddlerFile) {
      const createdTime = toTWUTCString(new Date());
      fs.writeFileSync(
        metaFileAbsolutePath,
        `caption: ${fileNameBase}\ncreated: ${createdTime}\nmodified: ${createdTime}\ntitle: ${fileName}\ntype: ${fileMimeType}\n`,
      );
      // need to delete original created file, because tiddlywiki will try to recreate a _1 file
      fs.unlinkSync(fileAbsolutePath);
      fs.unlinkSync(metaFileAbsolutePath);
    }

    const { tiddlers, ...fileDescriptor } = tiddlersDescriptor;

    // If file is new to index (use actualFileRelativePath for .meta files)
    if (!this.filePathExistsInIndex(actualFileRelativePath)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tiddlers.forEach((tiddler: any) => {
        const existedWikiRecord = $tw.wiki.getTiddler(tiddler.title as string);
        if (existedWikiRecord && deepEqual(tiddler, existedWikiRecord.fields)) {
          // File creation triggered by wiki

          this.updateInverseIndex(actualFileRelativePath, { ...fileDescriptor, tiddlerTitle: tiddler.title as string } as IBootFilesIndexItemWithTitle);
        } else {
          // New tiddler from external source

          this.updateInverseIndex(actualFileRelativePath, { ...fileDescriptor, tiddlerTitle: tiddler.title as string } as IBootFilesIndexItemWithTitle);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          $tw.syncadaptor!.wiki.addTiddler(tiddler);
          this.logger.log(`[test-id-WATCH_FS_TIDDLER_ADDED] ${tiddler.title as string}`);
        }
      });
    } else {
      // File already exists in index - check if change is from external source
      tiddlers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((tiddler: any) => {
          const tiddlerInWiki = $tw.wiki.getTiddler(tiddler.title as string)?.fields;
          if (tiddlerInWiki === undefined) {
            return true;
          }
          if (deepEqual(tiddler, tiddlerInWiki)) {
            return false;
          }
          // Check timestamp to avoid updating with stale data

          if (tiddler.modified && tiddlerInWiki.modified && tiddlerInWiki.modified > tiddler.modified) {
            return false;
          }

          return true;
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .forEach((tiddler: any) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          $tw.syncadaptor!.wiki.addTiddler(tiddler);
          this.logger.log(`[test-id-WATCH_FS_TIDDLER_UPDATED] ${tiddler.title as string}`);
        });
    }
  }

  /**
   * Handle file delete events
   */
  private handleFileDelete(fileAbsolutePath: string, fileRelativePath: string, _fileExtension: string): void {
    const tiddlerTitle = this.getTitleByPath(fileRelativePath);

    // Check if tiddler still exists in wiki
    const existedTiddlerResult = $tw.wiki.getTiddler(tiddlerTitle);

    if (!existedTiddlerResult) {
      // Already deleted by wiki
      this.updateInverseIndex(fileRelativePath, undefined);
    } else {
      // Delete triggered by external source
      this.lockedFiles.add(fileRelativePath);

      // Remove tiddler from wiki (this won't try to delete file again)
      this.removeTiddlerFileInfo(tiddlerTitle);

      // Actually delete the tiddler from wiki to trigger change event
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

      this.updateInverseIndex(fileRelativePath, undefined);
    }
  }

  /**
   * Cleanup method to properly close watcher when wiki is shutting down
   */
  public async cleanup(): Promise<void> {
    if (this.watcher) {
      this.logger.log('[WATCH_FS_CLEANUP] Closing filesystem watcher');
      await this.watcher.close();
      this.watcher = undefined;
      this.watcherStabilized = false;
      this.logger.log('[WATCH_FS_CLEANUP] Filesystem watcher closed');
    }
  }
}

// Only export in Node.js environment
if ($tw.node) {
  exports.adaptorClass = WatchFileSystemAdaptor;
}
