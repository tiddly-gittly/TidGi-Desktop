import { workspace } from '@services/wiki/wikiWorker/services';
import fs from 'fs';
import nsfw from 'nsfw';
import path from 'path';
import type { Tiddler, Wiki } from 'tiddlywiki';
import { FileSystemAdaptor, type IFileSystemAdaptorCallback } from './FileSystemAdaptor';
import { type IBootFilesIndexItemWithTitle, InverseFilesIndex } from './InverseFilesIndex';
import { getActionName } from './utilities';

/**
 * Delay in milliseconds before re-including a file in the watcher after save/delete operations.
 * This prevents race conditions where the watcher might detect our own file changes:
 * - File write operations may not be atomic and can trigger partial write events
 * - Some filesystems buffer writes and flush asynchronously
 * - The watcher needs time to process the excludeFile() call before the actual file operation completes
 * 200ms provides a safe margin for most filesystems while keeping UI responsiveness.
 */
const FILE_EXCLUSION_CLEANUP_DELAY_MS = 200;

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
export class WatchFileSystemAdaptor extends FileSystemAdaptor {
  name = 'watch-filesystem';
  /** Inverse index: filepath -> tiddler info for fast lookup, also manages sub-wiki info */
  private inverseFilesIndex: InverseFilesIndex = new InverseFilesIndex();
  /** NSFW watcher instance for main wiki */
  private watcher: nsfw.NSFW | undefined;
  /** Base excluded paths (permanent) */
  private baseExcludedPaths: string[] = [];
  /**
   * Track timers for file inclusion to prevent race conditions.
   * When saving the same file multiple times rapidly, we need to ensure
   * only the last save's timer runs. This Map tracks one timer per file path.
   * The timer is managed by scheduleFileInclusion() method.
   */
  private inclusionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: { boot?: typeof $tw.boot; wiki: Wiki }) {
    super(options);
    this.logger = new $tw.utils.Logger('watch-filesystem', { colour: 'purple' });

    // Initialize main wiki path in index
    this.inverseFilesIndex.setMainWikiPath(this.watchPathBase);

    // Initialize file watching
    void this.initializeFileWatching();
  }

  /**
   * Save a tiddler to the filesystem (with file watching support)
   * Can be used with callback (legacy) or as async/await
   */
  override async saveTiddler(tiddler: Tiddler, callback?: IFileSystemAdaptorCallback, options?: { tiddlerInfo?: Record<string, unknown> }): Promise<void> {
    try {
      // Get file info to calculate path for watching
      const fileInfo = await this.getTiddlerFileInfo(tiddler);
      if (!fileInfo) {
        const error = new Error('No fileInfo returned from getTiddlerFileInfo');
        callback?.(error);
        throw error;
      }

      // Log tiddler text for debugging
      const textPreview = (tiddler.fields.text ?? '').substring(0, 50);
      this.logger.log(`[WATCH_FS_SAVE] Saving "${tiddler.fields.title}", text: ${textPreview}`);

      // Exclude file from watching during save
      await this.excludeFile(fileInfo.filepath);

      // Call parent's saveTiddler to handle the actual save
      await super.saveTiddler(tiddler, undefined, options);

      // Update inverse index after successful save
      const finalFileInfo = this.boot.files[tiddler.fields.title];
      const fileRelativePath = path.relative(this.watchPathBase, finalFileInfo.filepath);
      this.inverseFilesIndex.set(fileRelativePath, {
        ...finalFileInfo,
        filepath: fileRelativePath,
        tiddlerTitle: tiddler.fields.title,
      });

      // Notify callback if provided
      callback?.(null, finalFileInfo);

      // Schedule file re-inclusion after save completes
      this.scheduleFileInclusion(fileInfo.filepath);
    } catch (error) {
      const errorObject = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
      callback?.(errorObject);
      throw errorObject;
    }
  }

  /**
   * Delete a tiddler from the filesystem (with file watching support)
   * Can be used with callback (legacy) or as async/await
   */
  override async deleteTiddler(title: string, callback?: IFileSystemAdaptorCallback, _options?: unknown): Promise<void> {
    const fileInfo = this.boot.files[title];

    if (!fileInfo) {
      callback?.(null, null);
      return;
    }

    // Calculate relative path for watching
    const fileRelativePath = path.relative(this.watchPathBase, fileInfo.filepath);

    try {
      // Exclude file before deletion
      await this.excludeFile(fileRelativePath);

      // Call parent's deleteTiddler to handle the actual deletion
      await super.deleteTiddler(title, undefined, _options);

      // Update inverse index after successful deletion
      this.inverseFilesIndex.delete(fileRelativePath);

      // Notify callback if provided
      callback?.(null, null);

      // Schedule file re-inclusion after deletion completes
      this.scheduleFileInclusion(fileRelativePath);
    } catch (error) {
      // Schedule file re-inclusion on error to clean up exclusion list
      this.scheduleFileInclusion(fileRelativePath);
      const errorObject = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
      callback?.(errorObject);
      throw errorObject;
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
      // Initialize sub-wiki watchers
      await this.initializeSubWikiWatchers();
      // Log stabilization marker for tests
      this.logger.log('[test-id-WATCH_FS_STABILIZED] Watcher has stabilized');
    } catch (error) {
      this.logger.alert('[WATCH_FS_ERROR] Failed to initialize file watching:', error);
    }
  }

  /**
   * Initialize watchers for sub-wikis
   */
  private async initializeSubWikiWatchers(): Promise<void> {
    if (!this.workspaceID) {
      return;
    }

    try {
      // Get sub-wikis for this main wiki
      const subWikis = await workspace.getSubWorkspacesAsList(this.workspaceID);

      this.logger.log(`[WATCH_FS_SUBWIKI] Found ${subWikis.length} sub-wikis to watch`);

      // Create watcher for each sub-wiki
      for (const subWiki of subWikis) {
        // Only watch wiki workspaces
        if (!('wikiFolderLocation' in subWiki) || !subWiki.wikiFolderLocation) {
          continue;
        }

        // Sub-wikis are folders directly, not wiki/tiddlers structure
        const subWikiPath = subWiki.wikiFolderLocation;

        // Check if the path exists before trying to watch
        if (!fs.existsSync(subWikiPath)) {
          this.logger.log(`[WATCH_FS_SUBWIKI] Path does not exist for sub-wiki ${subWiki.name}: ${subWikiPath}`);
          continue;
        }

        try {
          const subWikiWatcher = await nsfw(
            subWikiPath,
            (events) => {
              this.handleNsfwEvents(events);
            },
            {
              debounceMS: 100,
              errorCallback: (error) => {
                this.logger.alert(`[WATCH_FS_ERROR] NSFW error for sub-wiki ${subWiki.name}:`, error);
              },
            },
          );

          await subWikiWatcher.start();
          this.inverseFilesIndex.registerSubWiki(subWiki.id, subWikiPath, subWikiWatcher);

          this.logger.log(`[WATCH_FS_SUBWIKI] Watching sub-wiki: ${subWiki.name} at ${subWikiPath}`);
        } catch (error) {
          this.logger.alert(`[WATCH_FS_ERROR] Failed to watch sub-wiki ${subWiki.name}:`, error);
        }
      }
    } catch (error) {
      this.logger.alert('[WATCH_FS_ERROR] Failed to initialize sub-wiki watchers:', error);
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
        this.inverseFilesIndex.set(fileRelativePath, { ...fileDescriptor, filepath: fileRelativePath, tiddlerTitle });
      }
    }
  }

  /**
   * Update watcher's excluded paths with current temporary exclusions
   */
  private async updateWatcherExcludedPaths(): Promise<void> {
    // Update main watcher
    if (this.watcher) {
      const allExcludedPaths = this.inverseFilesIndex.getMainWatcherExcludedPaths(this.baseExcludedPaths);
      // @ts-expect-error - nsfw types are incorrect, it accepts string[] not just [string]
      await this.watcher.updateExcludedPaths(allExcludedPaths);
    }

    // Update each sub-wiki watcher
    for (const subWiki of this.inverseFilesIndex.getSubWikis()) {
      const excludedPaths = this.inverseFilesIndex.getSubWikiExcludedPaths(subWiki.id);
      // @ts-expect-error - nsfw types are incorrect, it accepts string[] not just [string]
      await subWiki.watcher.updateExcludedPaths(excludedPaths);
    }
  }

  /**
   * Temporarily exclude a file from watching (e.g., during save/delete)
   * @param absoluteFilePath Absolute file path
   */
  private async excludeFile(absoluteFilePath: string): Promise<void> {
    this.logger.log(`[WATCH_FS_EXCLUDE] Excluding file: ${absoluteFilePath}`);
    this.inverseFilesIndex.excludeFile(absoluteFilePath);
    await this.updateWatcherExcludedPaths();
  }

  /**
   * Remove a file from temporary exclusions
   * @param absoluteFilePath Absolute file path
   */
  private async includeFile(absoluteFilePath: string): Promise<void> {
    this.logger.log(`[WATCH_FS_INCLUDE] Including file: ${absoluteFilePath}`);
    this.inverseFilesIndex.includeFile(absoluteFilePath);
    await this.updateWatcherExcludedPaths();
  }

  /**
   * Schedule file inclusion after a delay, clearing any existing timer for the same file.
   * This prevents race conditions when saving the same file multiple times rapidly.
   * @param filepath File path to schedule for inclusion
   */
  private scheduleFileInclusion(filepath: string): void {
    // Clear any existing timer for this file to prevent premature inclusion
    const existingTimer = this.inclusionTimers.get(filepath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new timer
    const timer = setTimeout(() => {
      void this.includeFile(filepath);
      this.inclusionTimers.delete(filepath);
    }, FILE_EXCLUSION_CLEANUP_DELAY_MS);

    this.inclusionTimers.set(filepath, timer);
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

      // Compute absolute path
      const fileAbsolutePath = path.join(directory, fileName);

      // Determine which wiki this file belongs to and compute relative path accordingly
      const subWikiInfo = this.inverseFilesIndex.getSubWikiForFile(fileAbsolutePath);
      const basePath = subWikiInfo ? subWikiInfo.path : this.watchPathBase;
      const fileRelativePath = path.relative(basePath, fileAbsolutePath);

      const fileNameBase = path.parse(fileAbsolutePath).name;
      const fileExtension = path.extname(fileRelativePath);
      const fileMimeType = $tw.utils.getFileExtensionInfo(fileExtension)?.type ?? 'text/vnd.tiddlywiki';
      const metaFileAbsolutePath = `${fileAbsolutePath}.meta`;

      this.logger.log('[WATCH_FS_EVENT]', getActionName(action), fileName, `(directory: ${directory})`);

      // Handle different event types
      if (action === nsfw.actions.CREATED || action === nsfw.actions.MODIFIED) {
        void this.handleFileAddOrChange(
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
          const oldSubWikiInfo = this.inverseFilesIndex.getSubWikiForFile(oldFileAbsPath);
          const oldBasePath = oldSubWikiInfo ? oldSubWikiInfo.path : this.watchPathBase;
          const oldFileRelativePath = path.relative(oldBasePath, oldFileAbsPath);
          const oldFileExtension = path.extname(oldFileRelativePath);
          this.handleFileDelete(oldFileAbsPath, oldFileRelativePath, oldFileExtension);

          const newDirectory = 'newDirectory' in event ? event.newDirectory : directory;
          const newFileAbsPath = path.join(newDirectory, event.newFile);
          const newSubWikiInfo = this.inverseFilesIndex.getSubWikiForFile(newFileAbsPath);
          const newBasePath = newSubWikiInfo ? newSubWikiInfo.path : this.watchPathBase;
          const newFileRelativePath = path.relative(newBasePath, newFileAbsPath);
          const newFileName = event.newFile;
          const newFileNameBase = path.parse(newFileAbsPath).name;
          const newFileExtension = path.extname(newFileRelativePath);
          const newFileMimeType = $tw.utils.getFileExtensionInfo(newFileExtension)?.type ?? 'text/vnd.tiddlywiki';
          const newMetaFileAbsPath = `${newFileAbsPath}.meta`;

          void this.handleFileAddOrChange(
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
  private async handleFileAddOrChange(
    fileAbsolutePath: string,
    fileRelativePath: string,
    metaFileAbsolutePath: string,
    fileName: string,
    fileNameBase: string,
    fileExtension: string,
    fileMimeType: string,
    changeType: 'add' | 'change',
  ): Promise<void> {
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
    for (const tiddler of tiddlers) {
      // Note: $tw.loadTiddlersFromFile returns tiddlers as plain objects with fields at top level,
      // not wrapped in a .fields property
      const tiddlerTitle = tiddler?.title;
      if (!tiddlerTitle) {
        this.logger.alert(`[WATCH_FS_ERROR] Tiddler has no title`);
        continue;
      }

      const isNewFile = !this.inverseFilesIndex.has(actualFileRelativePath);

      // Update inverse index first
      this.inverseFilesIndex.set(actualFileRelativePath, {
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
    }
  }

  /**
   * Handle file delete events
   */
  private handleFileDelete(fileAbsolutePath: string, fileRelativePath: string, _fileExtension: string): void {
    // Try to get tiddler title from filepath
    // If file is not in index, try to extract title from filename
    let tiddlerTitle: string;

    if (this.inverseFilesIndex.has(fileRelativePath)) {
      // File is in our inverse index
      try {
        tiddlerTitle = this.inverseFilesIndex.getTitleByPath(fileRelativePath);
      } catch {
        // fatal error, shutting down.
        if (this.watcher) {
          void this.watcher.stop();
        }
        throw new Error(`${fileRelativePath}\n↑ not existed in watch-fs plugin's FileSystemMonitor's inverseFilesIndex`);
      }
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
    this.inverseFilesIndex.delete(fileRelativePath);
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

    // Close all sub-wiki watchers
    for (const subWiki of this.inverseFilesIndex.getSubWikis()) {
      this.logger.log(`[WATCH_FS_CLEANUP] Closing sub-wiki watcher: ${subWiki.id}`);
      await subWiki.watcher.stop();
      this.inverseFilesIndex.unregisterSubWiki(subWiki.id);
    }
  }
}
