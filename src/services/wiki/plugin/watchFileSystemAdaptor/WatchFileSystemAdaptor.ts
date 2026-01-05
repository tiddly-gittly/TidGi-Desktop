import { workspace } from '@services/wiki/wikiWorker/services';
import { isWikiWorkspace, IWikiWorkspace } from '@services/workspaces/interface';
import type { IFileInfo, Syncer, Tiddler, Wiki } from 'tiddlywiki';
import { FileSystemAdaptor } from './FileSystemAdaptor';
import { FileSystemWatcher, type IUpdatedTiddlers } from './FileSystemWatcher';

/**
 * Enhanced filesystem adaptor that extends FileSystemAdaptor with file watching capabilities.
 *
 * Architecture (after refactoring):
 * - FileSystemWatcher: Monitors file system changes, collects updates to updatedTiddlers list
 * - WatchFileSystemAdaptor: Coordinates between watcher and syncer, implements syncadaptor interface
 *
 * Key design decisions:
 * 1. File changes are collected by FileSystemWatcher and processed by syncer
 * 2. syncer calls getUpdatedTiddlers() to get the list of changes
 * 3. syncer calls loadTiddler() to load each modified tiddler
 * 4. This eliminates direct wiki.addTiddler() calls, preventing echo loops
 *
 * Echo prevention:
 * - When we save/delete, we temporarily exclude the file from watching
 * - This prevents our own operations from being detected as external changes
 * - After operation completes, we re-include the file (with delay to handle nsfw debounce)
 */
export class WatchFileSystemAdaptor extends FileSystemAdaptor {
  name = 'watch-filesystem';
  supportsLazyLoading = true;

  private watcher: FileSystemWatcher | undefined;
  private workspace: IWikiWorkspace | undefined;

  constructor(options: { boot?: typeof $tw.boot; wiki: Wiki }) {
    super(options);
    this.logger = new $tw.utils.Logger('watch-filesystem', { colour: 'purple' });

    // Initialize asynchronously
    void this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    try {
      const workspaceId = this.workspaceID;
      if (workspaceId) {
        const loadedWorkspaceData = await workspace.get(workspaceId);
        if (!loadedWorkspaceData || typeof loadedWorkspaceData !== 'object' || !isWikiWorkspace(loadedWorkspaceData)) {
          throw new Error('Invalid workspace data');
        }
        this.workspace = loadedWorkspaceData;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.log(`Failed to load workspace data: ${errorMessage}`);
    }

    // Create and initialize the file watcher
    this.watcher = new FileSystemWatcher({
      wiki: this.wiki,
      boot: this.boot,
      logger: this.logger,
      workspaceID: this.workspaceID,
      workspaceConfig: this.workspace,
    });

    await this.watcher.initialize();
  }

  /**
   * Get updated tiddlers from the file watcher.
   * Called by syncer's SyncFromServerTask.
   */
  getUpdatedTiddlers(syncer: Syncer, callback: (error: Error | null, updates: IUpdatedTiddlers) => void): void {
    if (!this.watcher) {
      callback(null, { modifications: [], deletions: [] });
      return;
    }
    this.watcher.getUpdatedTiddlers(syncer, callback);
  }

  /**
   * Load a tiddler from the file system.
   * Called by syncer's LoadTiddlerTask for lazy loading.
   */
  override loadTiddler(
    title: string,
    callback: (error: Error | null | string, tiddlerFields?: Record<string, unknown> | null) => void,
  ): void {
    if (!this.watcher) {
      callback(null, null);
      return;
    }
    this.watcher.loadTiddler(title, callback);
  }

  /**
   * Save a tiddler to the filesystem (with file watching support)
   */
  override async saveTiddler(
    tiddler: Tiddler,
    callback?: (error: Error | null | string, adaptorInfo?: IFileInfo | null, revision?: string) => void,
    options?: { tiddlerInfo?: Record<string, unknown> },
  ): Promise<void> {
    try {
      const oldFileInfo = this.boot.files[tiddler.fields.title];

      // Pre-calculate file path for new tiddlers and exclude it
      let excludedNewFilePath: string | undefined;
      if (!oldFileInfo) {
        try {
          const newFileInfo = this.getTiddlerFileInfo(tiddler);
          if (newFileInfo?.filepath) {
            this.watcher?.excludeFile(newFileInfo.filepath);
            this.watcher?.excludeFile(`${newFileInfo.filepath}.meta`);
            excludedNewFilePath = newFileInfo.filepath;
          }
        } catch (error) {
          this.logger.alert(`WatchFileSystemAdaptor Failed to pre-calculate file path for new tiddler: ${tiddler.fields.title}`, error);
        }
      }

      // Exclude old file path before save
      if (oldFileInfo) {
        this.watcher?.excludeFile(oldFileInfo.filepath);
        this.watcher?.excludeFile(`${oldFileInfo.filepath}.meta`);
      }

      // Call parent's saveTiddler
      await super.saveTiddler(tiddler, undefined, options);

      // Update inverse index after successful save
      const finalFileInfo = this.boot.files[tiddler.fields.title];
      if (finalFileInfo && this.watcher) {
        this.watcher.updateIndexAfterSave(tiddler.fields.title, finalFileInfo);
      }

      callback?.(null, finalFileInfo);

      // Schedule re-inclusion after delay
      if (finalFileInfo) {
        this.watcher?.scheduleFileInclusion(finalFileInfo.filepath);
        this.watcher?.scheduleFileInclusion(`${finalFileInfo.filepath}.meta`);
      }

      // Re-include wrongly pre-excluded path
      if (excludedNewFilePath && excludedNewFilePath !== finalFileInfo?.filepath) {
        this.watcher?.scheduleFileInclusion(excludedNewFilePath);
        this.watcher?.scheduleFileInclusion(`${excludedNewFilePath}.meta`);
      }
    } catch (error) {
      const errorObject = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
      callback?.(errorObject);
      throw errorObject;
    }
  }

  /**
   * Delete a tiddler from the filesystem (with file watching support)
   */
  override async deleteTiddler(
    title: string,
    callback?: (error: Error | null | string, adaptorInfo?: IFileInfo | null) => void,
    _options?: unknown,
  ): Promise<void> {
    const fileInfo = this.boot.files[title];

    if (!fileInfo) {
      callback?.(null, null);
      return;
    }

    try {
      // Exclude file before deletion
      this.watcher?.excludeFile(fileInfo.filepath);

      // Call parent's deleteTiddler
      await super.deleteTiddler(title, undefined, _options);

      // Update inverse index
      if (this.watcher) {
        this.watcher.removeFromIndex(fileInfo.filepath);
      }

      callback?.(null, null);

      // Schedule re-inclusion
      this.watcher?.scheduleFileInclusion(fileInfo.filepath);
    } catch (error) {
      this.watcher?.scheduleFileInclusion(fileInfo.filepath);
      const errorObject = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
      callback?.(errorObject);
      throw errorObject;
    }
  }

  /**
   * Cleanup resources when shutting down
   */
  async cleanup(): Promise<void> {
    if (this.watcher) {
      await this.watcher.cleanup();
      this.watcher = undefined;
    }
  }
}
