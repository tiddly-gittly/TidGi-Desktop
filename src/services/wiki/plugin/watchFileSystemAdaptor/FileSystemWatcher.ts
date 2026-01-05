import type { Logger } from '$:/core/modules/utils/logger.js';
import { git, workspace } from '@services/wiki/wikiWorker/services';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import fs from 'fs';
import nsfw from 'nsfw';
import path from 'path';
import type { IFileInfo, Syncer, Wiki } from 'tiddlywiki';
import { type IBootFilesIndexItemWithTitle, InverseFilesIndex } from './InverseFilesIndex';

/**
 * Delay before actually processing file deletion.
 * This handles git operations that delete-then-recreate files (e.g., revert, checkout).
 * If a file is recreated within this window, we treat it as modification instead of delete+create.
 */
const FILE_DELETION_DELAY_MS = 100;

/**
 * Delay before re-including file after save/delete operations.
 * Must be longer than nsfw's debounceMS (100ms) to ensure all file system events
 * from our own operations are in the debounce queue before we re-include the file.
 */
const FILE_INCLUSION_DELAY_MS = 150;

/**
 * Delay before notifying git service about file changes.
 * Aggregates multiple file changes into a single notification.
 */
const GIT_NOTIFICATION_DELAY_MS = 1000;

/**
 * Delay before triggering syncer after file changes.
 * Allows multiple file changes (e.g., git checkout) to be batched together.
 */
const SYNCER_TRIGGER_DELAY_MS = 200;

export interface IUpdatedTiddlers {
  deletions: string[];
  modifications: string[];
}

/**
 * Represents a file change detected by the watcher.
 * Contains all information needed to load the tiddler.
 */
export interface IFileChange {
  absolutePath: string;
  relativePath: string;
  type: 'add' | 'change' | 'delete';
  /** Cached tiddler fields loaded during detection, avoids re-reading file */
  cachedTiddlerFields?: Record<string, unknown>;
}

/**
 * FileSystemWatcher: Responsible only for monitoring file system changes.
 *
 * This class implements a clean separation of concerns:
 * - Monitors file system using nsfw library
 * - Maintains exclusion list to prevent echo from our own save operations
 * - Collects file changes into updatedTiddlers list
 * - Triggers $tw.syncer.syncFromServer() to let syncer handle the actual wiki updates
 *
 * By delegating wiki updates to syncer, we:
 * - Avoid duplicating sync logic
 * - Get proper queuing and throttling for free
 * - Handle edge cases like git checkout (many files at once) correctly
 */
export class FileSystemWatcher {
  private readonly logger: Logger;
  private readonly wiki: Wiki;
  private readonly boot: typeof $tw.boot;
  private readonly watchPathBase: string;
  private readonly workspaceID: string;
  private readonly workspaceConfig: IWikiWorkspace | undefined;

  /** Inverse index for mapping file paths to tiddler information */
  private readonly inverseFilesIndex: InverseFilesIndex = new InverseFilesIndex();

  /** Main wiki nsfw watcher instance */
  private watcher: nsfw.NSFW | undefined;

  /** Base excluded paths (permanent) */
  private readonly baseExcludedPaths: string[] = [];

  /** Excluded path patterns that apply to all wikis */
  private readonly excludedPathPatterns: string[] = ['.git', 'node_modules', '.DS_Store'];

  /** External attachments folder to exclude */
  private externalAttachmentsFolder: string = 'files';

  /** Pending file deletions (for git revert/checkout handling) */
  private readonly pendingDeletions: Map<string, NodeJS.Timeout> = new Map();

  /** Pending file inclusions (to prevent memory leaks) */
  private readonly pendingInclusions: Map<string, NodeJS.Timeout> = new Map();

  /** Timer for debouncing git notifications */
  private gitNotificationTimer: NodeJS.Timeout | undefined;

  /** Timer for debouncing syncer trigger */
  private syncerTriggerTimer: NodeJS.Timeout | undefined;

  /** Whether to ignore symlinks */
  private ignoreSymlinks: boolean = true;

  /**
   * Collected file changes waiting to be processed by syncer.
   * The syncer will call getUpdatedTiddlers() to retrieve these.
   */
  private readonly updatedTiddlers: IUpdatedTiddlers = {
    modifications: [],
    deletions: [],
  };

  /**
   * Map of pending file changes that need to be loaded.
   * Key is tiddler title, value is the file change info.
   */
  private readonly pendingFileLoads: Map<string, IFileChange> = new Map();

  constructor(options: {
    boot: typeof $tw.boot;
    logger: Logger;
    wiki: Wiki;
    workspaceConfig?: IWikiWorkspace;
    workspaceID: string;
  }) {
    this.wiki = options.wiki;
    this.boot = options.boot;
    this.logger = options.logger;
    this.workspaceID = options.workspaceID;
    this.workspaceConfig = options.workspaceConfig;

    if (this.boot.wikiTiddlersPath) {
      this.watchPathBase = path.resolve(this.boot.wikiTiddlersPath);
    } else {
      this.watchPathBase = '';
    }

    // Initialize main wiki path in index
    this.inverseFilesIndex.setMainWikiPath(this.watchPathBase);

    // Load config from workspace
    if (this.workspaceConfig) {
      this.ignoreSymlinks = this.workspaceConfig.ignoreSymlinks;
      const externalAttachmentsFolderConfig = this.wiki.getTiddlerText('$:/config/ExternalAttachments/WikiFolderToMove', 'files');
      this.externalAttachmentsFolder = externalAttachmentsFolderConfig;
    }
  }

  /**
   * Initialize file watching - must be called after construction
   */
  async initialize(): Promise<void> {
    if (!this.watchPathBase) {
      this.logger.log('[test-id-WATCH_FS_STABILIZED] Watcher has stabilized (no watch path)');
      return;
    }

    // Check if file system watch is enabled for this workspace
    if (this.workspaceConfig && !this.workspaceConfig.enableFileSystemWatch) {
      this.logger.log('[test-id-WATCH_FS_STABILIZED] Watcher has stabilized (disabled by config)');
      this.logger.log('FileSystemWatcher File system watching is disabled for this workspace');
      return;
    }

    // Initialize inverse index from boot.files
    this.initializeInverseFilesIndex();

    // Setup base excluded paths
    this.baseExcludedPaths.push(
      path.join(this.watchPathBase, 'subwiki'),
      path.join(this.watchPathBase, '$__StoryList'),
    );

    // Setup nsfw watcher
    await this.setupNsfwWatcher();
  }

  /**
   * Get the collected updates and clear them.
   * Called by syncer's SyncFromServerTask.
   */
  getUpdatedTiddlers(_syncer: Syncer, callback: (error: Error | null, updates: IUpdatedTiddlers) => void): void {
    const updates = {
      modifications: [...this.updatedTiddlers.modifications],
      deletions: [...this.updatedTiddlers.deletions],
    };

    // Clear collected updates
    this.updatedTiddlers.modifications = [];
    this.updatedTiddlers.deletions = [];

    callback(null, updates);
  }

  /**
   * Load a tiddler from the file system.
   * Called by syncer's LoadTiddlerTask for lazy loading.
   */
  loadTiddler(title: string, callback: (error: Error | null, tiddlerFields?: Record<string, unknown> | null) => void): void {
    const fileChange = this.pendingFileLoads.get(title);
    if (!fileChange) {
      // No pending load for this title - the tiddler might be a shadow tiddler
      // or already loaded, return null to indicate no new data
      callback(null, null);
      return;
    }

    try {
      // Use cached tiddler fields if available (loaded during detection)
      if (fileChange.cachedTiddlerFields) {
        // Still need to update boot.files for subsequent saves
        const hasMetaFile = fileChange.absolutePath.endsWith('.tid') ? false : fs.existsSync(`${fileChange.absolutePath}.meta`);
        this.boot.files[title] = {
          filepath: fileChange.absolutePath,
          type: (fileChange.cachedTiddlerFields.type as string) ?? 'application/x-tiddler',
          hasMetaFile,
          isEditableFile: true,
        };
        callback(null, fileChange.cachedTiddlerFields);
        this.pendingFileLoads.delete(title);
        return;
      }

      // Fallback: Load tiddler from file (should rarely happen)
      const tiddlersDescriptor = $tw.loadTiddlersFromFile(fileChange.absolutePath);
      const tiddlers = tiddlersDescriptor.tiddlers;

      if (tiddlers.length === 0) {
        callback(null, null);
        return;
      }

      // Find the tiddler with matching title
      const tiddler = tiddlers.find(t => t.title === title);
      if (!tiddler) {
        // Title doesn't match - might be renamed, return first tiddler
        callback(null, tiddlers[0] as unknown as Record<string, unknown>);
      } else {
        callback(null, tiddler as unknown as Record<string, unknown>);
      }

      // Remove from pending loads
      this.pendingFileLoads.delete(title);

      // Update boot.files so getTiddlerInfo() works correctly
      const { tiddlers: _, ...fileDescriptor } = tiddlersDescriptor;
      const absoluteFilePath = fileChange.absolutePath;
      this.boot.files[title] = {
        filepath: absoluteFilePath,
        type: fileDescriptor.type ?? 'application/x-tiddler',
        hasMetaFile: fileDescriptor.hasMetaFile ?? false,
        isEditableFile: fileDescriptor.isEditableFile ?? true,
      };

      // Update inverse index (with tiddlerTitle for reverse lookup)
      this.inverseFilesIndex.set(fileChange.relativePath, {
        ...fileDescriptor,
        filepath: fileChange.relativePath,
        tiddlerTitle: title,
      } as IBootFilesIndexItemWithTitle);
    } catch (error) {
      this.logger.alert('FileSystemWatcher Failed to load tiddler:', title, error);
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get information about a pending file load
   */
  getPendingFileLoad(title: string): IFileChange | undefined {
    return this.pendingFileLoads.get(title);
  }

  /**
   * Temporarily exclude a file from watching (during save/delete operations)
   */
  excludeFile(absoluteFilePath: string): void {
    this.inverseFilesIndex.excludeFile(absoluteFilePath);
  }

  /**
   * Schedule a file to be re-included after a delay
   */
  scheduleFileInclusion(absoluteFilePath: string): void {
    const existingTimer = this.pendingInclusions.get(absoluteFilePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.inverseFilesIndex.includeFile(absoluteFilePath);
      this.pendingInclusions.delete(absoluteFilePath);
      this.scheduleGitNotification();
    }, FILE_INCLUSION_DELAY_MS);

    this.pendingInclusions.set(absoluteFilePath, timer);
  }

  /**
   * Update the inverse index after a tiddler is saved
   */
  updateIndexAfterSave(title: string, fileInfo: IFileInfo): void {
    const fileRelativePath = path.relative(this.watchPathBase, fileInfo.filepath);
    this.inverseFilesIndex.set(fileRelativePath, {
      ...fileInfo,
      filepath: fileRelativePath,
      tiddlerTitle: title,
    });
  }

  /**
   * Remove a tiddler from the inverse index after deletion
   */
  removeFromIndex(absoluteFilePath: string): void {
    const fileRelativePath = path.relative(this.watchPathBase, absoluteFilePath);
    this.inverseFilesIndex.delete(fileRelativePath);
  }

  /**
   * Get tiddler title by file path
   */
  getTitleByPath(relativePath: string): string | undefined {
    try {
      return this.inverseFilesIndex.getTitleByPath(relativePath);
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a file path is in the inverse index
   */
  hasFile(relativePath: string): boolean {
    return this.inverseFilesIndex.has(relativePath);
  }

  /**
   * Get sub-wiki info for a file
   */
  getSubWikiForFile(absoluteFilePath: string) {
    return this.inverseFilesIndex.getSubWikiForFile(absoluteFilePath);
  }

  /**
   * Cleanup resources when shutting down
   */
  async cleanup(): Promise<void> {
    // Clear timers
    if (this.gitNotificationTimer) {
      clearTimeout(this.gitNotificationTimer);
      this.gitNotificationTimer = undefined;
    }
    if (this.syncerTriggerTimer) {
      clearTimeout(this.syncerTriggerTimer);
      this.syncerTriggerTimer = undefined;
    }

    for (const timer of this.pendingDeletions.values()) {
      clearTimeout(timer);
    }
    this.pendingDeletions.clear();

    for (const timer of this.pendingInclusions.values()) {
      clearTimeout(timer);
    }
    this.pendingInclusions.clear();

    // Stop main watcher
    if (this.watcher) {
      this.logger.log('FileSystemWatcher Closing filesystem watcher');
      await this.watcher.stop();
      this.watcher = undefined;
    }

    // Stop sub-wiki watchers
    for (const subWiki of this.inverseFilesIndex.getSubWikis()) {
      this.logger.log(`FileSystemWatcher Closing sub-wiki watcher: ${subWiki.id}`);
      await subWiki.watcher.stop();
      this.inverseFilesIndex.unregisterSubWiki(subWiki.id);
    }
  }

  private initializeInverseFilesIndex(): void {
    const initialLoadedFiles = this.boot.files;
    for (const tiddlerTitle in initialLoadedFiles) {
      if (Object.hasOwn(initialLoadedFiles, tiddlerTitle)) {
        const fileDescriptor = initialLoadedFiles[tiddlerTitle];
        const fileRelativePath = path.relative(this.watchPathBase, fileDescriptor.filepath);
        this.inverseFilesIndex.set(fileRelativePath, { ...fileDescriptor, filepath: fileRelativePath, tiddlerTitle });
      }
    }
  }

  private async setupNsfwWatcher(): Promise<void> {
    try {
      this.watcher = await nsfw(
        this.watchPathBase,
        (events) => {
          this.handleNsfwEvents(events);
        },
        {
          debounceMS: 100,
          errorCallback: (error) => {
            this.logger.alert('FileSystemWatcher NSFW error:', error);
          },
          // @ts-expect-error - nsfw types are incorrect
          excludedPaths: [...this.baseExcludedPaths],
        },
      );

      await this.watcher.start();
      await this.initializeSubWikiWatchers();
      this.logger.log('[test-id-WATCH_FS_STABILIZED] Watcher has stabilized');
    } catch (error) {
      this.logger.alert('FileSystemWatcher Failed to initialize file watching:', error);
      // Still log stabilized marker even if initialization failed
      // This prevents tests from hanging waiting for the marker
      this.logger.log('[test-id-WATCH_FS_STABILIZED] Watcher has stabilized (with errors)');
    }
  }

  private async initializeSubWikiWatchers(): Promise<void> {
    if (!this.workspaceID) {
      return;
    }

    try {
      const subWikis = await workspace.getSubWorkspacesAsList(this.workspaceID);
      this.logger.log(`FileSystemWatcher Found ${subWikis.length} sub-wikis to watch`);

      for (const subWiki of subWikis) {
        if (!('wikiFolderLocation' in subWiki) || !subWiki.wikiFolderLocation) {
          continue;
        }

        const subWikiPath = subWiki.wikiFolderLocation;

        if (!fs.existsSync(subWikiPath)) {
          this.logger.log(`FileSystemWatcher Path does not exist for sub-wiki ${subWiki.name}: ${subWikiPath}`);
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
                this.logger.alert(`FileSystemWatcher NSFW error for sub-wiki ${subWiki.name}:`, error);
              },
              // @ts-expect-error - nsfw types are incorrect
              excludedPaths: this.excludedPathPatterns.map(pattern => path.join(subWikiPath, pattern)),
            },
          );

          await subWikiWatcher.start();
          this.inverseFilesIndex.registerSubWiki(subWiki.id, subWikiPath, subWikiWatcher);
          this.logger.log(`FileSystemWatcher Watching sub-wiki: ${subWiki.name} at ${subWikiPath}`);
        } catch (error) {
          this.logger.alert(`FileSystemWatcher Failed to watch sub-wiki ${subWiki.name}:`, error);
        }
      }
    } catch (error) {
      this.logger.alert('FileSystemWatcher Failed to initialize sub-wiki watchers:', error);
    }
  }

  private handleNsfwEvents(events: nsfw.FileChangeEvent[]): void {
    let hasFileChanges = false;

    for (const event of events) {
      const { action, directory } = event;

      let fileName = '';
      if ('file' in event) {
        fileName = event.file;
      } else if ('newFile' in event) {
        fileName = event.newFile;
      }

      const fileAbsolutePath = path.join(directory, fileName);

      // Skip excluded patterns
      if (this.shouldExcludeByPattern(fileAbsolutePath) || this.shouldExcludeByPattern(directory)) {
        continue;
      }

      // Skip directories
      if (action === nsfw.actions.CREATED || action === nsfw.actions.MODIFIED) {
        try {
          const stats = fs.statSync(fileAbsolutePath);
          if (stats.isDirectory()) {
            continue;
          }
          if (this.ignoreSymlinks && stats.isSymbolicLink()) {
            continue;
          }
        } catch {
          continue;
        }
      }

      // Check exclusion list
      const subWikiForExclusion = this.inverseFilesIndex.getSubWikiForFile(fileAbsolutePath);
      const isExcluded = subWikiForExclusion
        ? this.inverseFilesIndex.isSubWikiFileExcluded(subWikiForExclusion.id, fileAbsolutePath)
        : this.inverseFilesIndex.isMainFileExcluded(fileAbsolutePath);

      if (isExcluded) {
        this.logger.log(`FileSystemWatcher Skipping excluded file: ${fileAbsolutePath}`);
        continue;
      }

      hasFileChanges = true;

      // Compute relative path
      const subWikiInfo = this.inverseFilesIndex.getSubWikiForFile(fileAbsolutePath);
      const basePath = subWikiInfo ? subWikiInfo.path : this.watchPathBase;
      const fileRelativePath = path.relative(basePath, fileAbsolutePath);
      const fileExtension = path.extname(fileRelativePath);

      // Handle events
      if (action === nsfw.actions.CREATED || action === nsfw.actions.MODIFIED) {
        this.cancelPendingDeletion(fileAbsolutePath);
        this.handleFileAddOrChange(fileAbsolutePath, fileRelativePath, fileExtension, action === nsfw.actions.CREATED ? 'add' : 'change');
      } else if (action === nsfw.actions.DELETED) {
        this.scheduleDeletion(fileAbsolutePath, fileRelativePath, fileExtension);
      } else if (action === nsfw.actions.RENAMED) {
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
          const newFileExtension = path.extname(newFileRelativePath);
          this.handleFileAddOrChange(newFileAbsPath, newFileRelativePath, newFileExtension, 'add');
        }
      }
    }

    if (hasFileChanges) {
      this.scheduleGitNotification();
    }
  }

  /**
   * Handle file add or change events.
   * Instead of directly calling wiki.addTiddler(), we collect the change
   * and trigger syncer to handle it.
   */
  private handleFileAddOrChange(
    fileAbsolutePath: string,
    fileRelativePath: string,
    fileExtension: string,
    changeType: 'add' | 'change',
  ): void {
    // For .meta files, process the corresponding base file
    let actualFileAbsPath = fileAbsolutePath;
    let actualFileRelativePath = fileRelativePath;
    if (fileExtension === '.meta') {
      actualFileAbsPath = fileAbsolutePath.slice(0, -5);
      actualFileRelativePath = fileRelativePath.slice(0, -5);
    }

    // Load the file to get tiddler titles
    let tiddlersDescriptor;
    try {
      tiddlersDescriptor = $tw.loadTiddlersFromFile(actualFileAbsPath);
    } catch (error) {
      this.logger.alert('FileSystemWatcher Failed to load file:', actualFileAbsPath, error);
      return;
    }

    const { tiddlers, ...fileDescriptor } = tiddlersDescriptor;

    for (const tiddler of tiddlers) {
      const tiddlerTitle = tiddler?.title;
      if (!tiddlerTitle) {
        this.logger.alert(`FileSystemWatcher Tiddler has no title. File: ${actualFileAbsPath}`);
        continue;
      }

      // Store the file change info for later loading by syncer
      // Cache tiddler fields to avoid re-reading file in loadTiddler()
      this.pendingFileLoads.set(tiddlerTitle, {
        absolutePath: actualFileAbsPath,
        relativePath: actualFileRelativePath,
        type: changeType,
        cachedTiddlerFields: tiddler as unknown as Record<string, unknown>,
      });

      // Update inverse index
      this.inverseFilesIndex.set(actualFileRelativePath, {
        ...fileDescriptor,
        filepath: actualFileRelativePath,
        tiddlerTitle,
      } as IBootFilesIndexItemWithTitle);

      // Add to modifications list (syncer will handle duplicates)
      if (!this.updatedTiddlers.modifications.includes(tiddlerTitle)) {
        this.updatedTiddlers.modifications.push(tiddlerTitle);
      }

      this.logger.log(`[test-id-WATCH_FS_TIDDLER_${changeType === 'add' ? 'ADDED' : 'UPDATED'}] ${tiddlerTitle}`);
    }

    // Trigger syncer to process the changes
    this.scheduleSyncerTrigger();
  }

  private handleFileDelete(_fileAbsolutePath: string, fileRelativePath: string, _fileExtension: string): void {
    let tiddlerTitle: string;

    if (this.inverseFilesIndex.has(fileRelativePath)) {
      try {
        tiddlerTitle = this.inverseFilesIndex.getTitleByPath(fileRelativePath);
      } catch {
        this.logger.alert(`FileSystemWatcher Could not find title for: ${fileRelativePath}`);
        return;
      }
    } else {
      // Extract title from filename as fallback
      const fileNameWithoutExtension = path.basename(fileRelativePath, path.extname(fileRelativePath));
      tiddlerTitle = fileNameWithoutExtension;
    }

    // Add to deletions list
    if (!this.updatedTiddlers.deletions.includes(tiddlerTitle)) {
      this.updatedTiddlers.deletions.push(tiddlerTitle);
    }

    // Remove from modifications if present (deletion takes precedence)
    const modIndex = this.updatedTiddlers.modifications.indexOf(tiddlerTitle);
    if (modIndex !== -1) {
      this.updatedTiddlers.modifications.splice(modIndex, 1);
    }

    // Clean up boot.files so syncer won't try to delete the file again
    if (this.boot.files[tiddlerTitle]) {
      delete this.boot.files[tiddlerTitle];
    }

    // Clean up internal tracking
    this.pendingFileLoads.delete(tiddlerTitle);
    this.inverseFilesIndex.delete(fileRelativePath);

    this.logger.log(`[test-id-WATCH_FS_TIDDLER_DELETED] ${tiddlerTitle}`);

    // Trigger syncer
    this.scheduleSyncerTrigger();
  }

  private scheduleDeletion(fileAbsolutePath: string, fileRelativePath: string, fileExtension: string): void {
    this.cancelPendingDeletion(fileAbsolutePath);

    const timer = setTimeout(() => {
      this.handleFileDelete(fileAbsolutePath, fileRelativePath, fileExtension);
      this.pendingDeletions.delete(fileAbsolutePath);
    }, FILE_DELETION_DELAY_MS);

    this.pendingDeletions.set(fileAbsolutePath, timer);
  }

  private cancelPendingDeletion(fileAbsolutePath: string): void {
    const existingTimer = this.pendingDeletions.get(fileAbsolutePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.pendingDeletions.delete(fileAbsolutePath);
      this.logger.log(`FileSystemWatcher Cancelled pending deletion for: ${fileAbsolutePath}`);
    }
  }

  private shouldExcludeByPattern(filePath: string): boolean {
    const pathParts = filePath.split(path.sep);
    const hasExcludedPattern = this.excludedPathPatterns.some(pattern => pathParts.includes(pattern));
    const hasExternalAttachmentsFolder = pathParts.includes(this.externalAttachmentsFolder);
    return hasExcludedPattern || hasExternalAttachmentsFolder;
  }

  private scheduleGitNotification(): void {
    if (this.gitNotificationTimer) {
      clearTimeout(this.gitNotificationTimer);
    }

    this.gitNotificationTimer = setTimeout(() => {
      const wikiFolderLocation = path.dirname(this.watchPathBase);
      try {
        void git.notifyFileChange(wikiFolderLocation, { onlyWhenGitLogOpened: true });
      } catch (error) {
        this.logger.alert('FileSystemWatcher Failed to notify git service:', error);
      }
      this.gitNotificationTimer = undefined;
    }, GIT_NOTIFICATION_DELAY_MS);
  }

  /**
   * Schedule syncer trigger with debounce.
   * This allows multiple file changes to be batched together.
   */
  private scheduleSyncerTrigger(): void {
    if (this.syncerTriggerTimer) {
      clearTimeout(this.syncerTriggerTimer);
    }

    this.syncerTriggerTimer = setTimeout(() => {
      // Trigger syncer to process collected changes
      if ($tw.syncer) {
        $tw.syncer.syncFromServer();
      } else {
        this.logger.log('FileSystemWatcher Warning: $tw.syncer is not available, file changes will not be synced');
      }
      this.syncerTriggerTimer = undefined;
    }, SYNCER_TRIGGER_DELAY_MS);
  }
}
