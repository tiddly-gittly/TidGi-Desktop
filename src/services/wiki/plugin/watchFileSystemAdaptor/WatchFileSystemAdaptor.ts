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
    this.logger.log('WatchFileSystemAdaptor initializeAsync starting');
    try {
      const workspaceId = this.workspaceID;
      this.logger.log(`WatchFileSystemAdaptor loading workspace config for ${workspaceId}`);
      if (workspaceId) {
        const loadedWorkspaceData = await workspace.get(workspaceId);
        if (!loadedWorkspaceData || typeof loadedWorkspaceData !== 'object' || !isWikiWorkspace(loadedWorkspaceData)) {
          throw new Error('Invalid workspace data');
        }
        this.workspace = loadedWorkspaceData;
        this.logger.log(`WatchFileSystemAdaptor workspace config loaded, enableFileSystemWatch=${this.workspace.enableFileSystemWatch}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.log(`Failed to load workspace data: ${errorMessage}`);
    }

    this.logger.log('WatchFileSystemAdaptor creating FileSystemWatcher');
    // Create and initialize the file watcher
    this.watcher = new FileSystemWatcher({
      wiki: this.wiki,
      boot: this.boot,
      logger: this.logger,
      workspaceID: this.workspaceID,
      workspaceConfig: this.workspace,
    });

    this.logger.log('WatchFileSystemAdaptor calling watcher.initialize()');
    await this.watcher.initialize();
    this.logger.log('WatchFileSystemAdaptor initialization complete');
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
   * Save a tiddler to the filesystem (with file watching support).
   */
  override async saveTiddler(
    tiddler: Tiddler,
    callback?: (error: Error | null | string, adaptorInfo?: IFileInfo | null, revision?: string) => void,
    options?: { tiddlerInfo?: Record<string, unknown> },
  ): Promise<void> {
    const title = tiddler.fields.title;
    try {
      // Mark as saving so watcher ignores events for this title
      this.watcher?.markSaving(title);

      // Call parent's saveTiddler (writes to disk)
      await super.saveTiddler(tiddler, undefined, options);

      // Update inverse index after successful save
      const finalFileInfo = this.boot.files[title];
      if (finalFileInfo && this.watcher) {
        this.watcher.updateIndexAfterSave(title, finalFileInfo);
        // Record mtime+size so the watcher can skip the echo from this write
        this.watcher.markSaveComplete(title, finalFileInfo.filepath);
        // Also record for .meta companion file
        this.watcher.markSaveComplete(title, `${finalFileInfo.filepath}.meta`);
      } else {
        // No fileInfo → clear saving flag anyway
        this.watcher?.markSaveComplete(title, '');
      }

      callback?.(null, finalFileInfo);
    } catch (error) {
      // Clear saving flag on error so watcher isn't stuck
      this.watcher?.markSaveComplete(title, '');
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
      // Mark as saving so watcher ignores events for this title
      this.watcher?.markSaving(title);

      // Call parent's deleteTiddler
      await super.deleteTiddler(title, undefined, _options);

      // Update inverse index
      this.watcher?.removeFromIndex(fileInfo.filepath);
      this.watcher?.markSaveComplete(title, fileInfo.filepath);

      callback?.(null, null);
    } catch (error) {
      this.watcher?.markSaveComplete(title, fileInfo.filepath);
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
