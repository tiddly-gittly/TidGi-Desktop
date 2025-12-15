import type { Logger } from '$:/core/modules/utils/logger.js';
import { workspace } from '@services/wiki/wikiWorker/services';
import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import { workspaceSorter } from '@services/workspaces/utilities';
import { backOff } from 'exponential-backoff';
import fs from 'fs';
import path from 'path';
import type { IFileInfo } from 'tiddlywiki';
import type { Tiddler, Wiki } from 'tiddlywiki';
import { isWikiWorkspaceWithRouting, matchTiddlerToWorkspace } from './routingUtilities';
import { isFileLockError } from './utilities';

/**
 * Base filesystem adaptor that handles tiddler save/delete operations and sub-wiki routing.
 * This class can be used standalone or extended for additional functionality like file watching.
 */
export class FileSystemAdaptor {
  name = 'filesystem';
  supportsLazyLoading = false;
  wiki: Wiki;
  boot: typeof $tw.boot;
  logger: Logger;
  workspaceID: string;
  /** All workspaces (main + sub-wikis) that have tagName or filter configured, sorted by order */
  protected wikisWithRouting: IWikiWorkspace[] = [];
  /** Cached extension filters from $:/config/FileSystemExtensions. Requires restart to reflect changes. */
  protected extensionFilters: string[] | undefined;
  protected watchPathBase!: string;

  constructor(options: { boot?: typeof $tw.boot; wiki: Wiki }) {
    this.wiki = options.wiki;
    this.boot = options.boot ?? $tw.boot;
    this.logger = new $tw.utils.Logger('filesystem', { colour: 'blue' });

    if (!$tw.node) {
      throw new Error('filesystem adaptor only works in Node.js environment');
    }

    // Get workspace ID from preloaded tiddler
    this.workspaceID = this.wiki.getTiddlerText('$:/info/tidgi/workspaceID', '');

    if (this.boot.wikiTiddlersPath) {
      $tw.utils.createDirectory(this.boot.wikiTiddlersPath);
      this.watchPathBase = path.resolve(this.boot.wikiTiddlersPath);
    } else {
      this.logger.alert('filesystem: wikiTiddlersPath is not set!');
      this.watchPathBase = '';
    }

    // Initialize extension filters cache
    this.initializeExtensionFiltersCache();

    // Initialize sub-wikis cache
    void this.updateSubWikisCache();
  }

  /**
   * Initialize and cache extension filters from $:/config/FileSystemExtensions.
   */
  protected initializeExtensionFiltersCache(): void {
    if (this.wiki.tiddlerExists('$:/config/FileSystemExtensions')) {
      const extensionFiltersText = this.wiki.getTiddlerText('$:/config/FileSystemExtensions', '');
      this.extensionFilters = extensionFiltersText.split('\n').filter(line => line.trim().length > 0);
    }
  }

  /**
   * Update the cached workspaces list (main + sub-wikis) and rebuild tag lookup map.
   * Sorted by order to ensure consistent priority when matching tags.
   * Main workspace can also have tagName/includeTagTree for priority routing.
   */
  protected async updateSubWikisCache(): Promise<void> {
    try {
      if (!this.workspaceID) {
        this.wikisWithRouting = [];
        return;
      }

      const currentWorkspace = await workspace.get(this.workspaceID);
      if (!currentWorkspace) {
        this.wikisWithRouting = [];
        return;
      }

      const allWorkspaces = await workspace.getWorkspacesAsList();

      // Filter to wiki workspaces with routing config (main or sub-wikis)
      const workspacesWithRouting = allWorkspaces
        .filter((w: IWorkspace): w is IWikiWorkspace => isWikiWorkspaceWithRouting(w, currentWorkspace.id))
        .sort(workspaceSorter);

      this.wikisWithRouting = workspacesWithRouting;
    } catch (error) {
      this.logger.alert('filesystem: Failed to update sub-wikis cache:', error);
    }
  }

  isReady(): boolean {
    return true;
  }

  getTiddlerInfo(tiddler: Tiddler): IFileInfo | undefined {
    const title = tiddler.fields.title;
    return this.boot.files[title];
  }

  /**
   * Main routing logic: determine where a tiddler should be saved based on its tags.
   * For draft tiddlers, check the original tiddler's tags.
   *
   * Priority:
   * 1. Direct tag match with sub-wiki tagNames
   * 2. If includeTagTree is enabled, use in-tagtree-of filter for recursive tag matching
   * 3. If fileSystemPathFilterEnable is enabled, use custom filterExpression
   * 4. Fall back to TiddlyWiki's FileSystemPaths logic
   *
   * IMPORTANT: We check if the target directory has changed. Only when directory changes
   * do we regenerate the file path. This prevents echo loops where slightly different
   * filenames trigger constant saves.
   */
  getTiddlerFileInfo(tiddler: Tiddler): IFileInfo | null {
    if (!this.boot.wikiTiddlersPath) {
      throw new Error('filesystem adaptor requires a valid wiki folder');
    }

    const title = tiddler.fields.title;
    let tags = tiddler.fields.tags ?? [];
    const existingFileInfo = this.boot.files[title];

    try {
      // For draft tiddlers (draft.of field), also check the original tiddler's tags
      // This ensures drafts are saved to the same sub-wiki as their target tiddler
      const draftOf = tiddler.fields['draft.of'];
      if (draftOf && typeof draftOf === 'string' && $tw.wiki) {
        // Get the original tiddler from the wiki
        const originalTiddler = $tw.wiki.getTiddler(draftOf);
        if (originalTiddler) {
          const originalTags = originalTiddler.fields.tags ?? [];
          // Merge tags from the original tiddler with the draft's tags
          tags = [...new Set([...tags, ...originalTags])];
        }
      }

      // Find matching workspace using the routing logic
      const matchingWiki = matchTiddlerToWorkspace(title, tags, this.wikisWithRouting, $tw.wiki, $tw.rootWidget);

      // Determine the target directory based on routing
      // Sub-wikis store tiddlers directly in their root folder (not in /tiddlers subfolder)
      // Only the main wiki uses /tiddlers because it has other meta files like .github
      let targetDirectory: string;
      if (matchingWiki) {
        targetDirectory = matchingWiki.wikiFolderLocation;
        // Resolve symlinks
        try {
          targetDirectory = fs.realpathSync(targetDirectory);
        } catch {
          // If realpath fails, use original
        }
      } else {
        targetDirectory = this.boot.wikiTiddlersPath;
      }

      // Check if existing file is already in the correct directory
      // If so, just return the existing fileInfo to avoid echo loops
      if (existingFileInfo?.filepath) {
        const existingDirectory = path.dirname(existingFileInfo.filepath);
        // For sub-wikis, check if file is in that wiki's folder (or subfolder)
        // For main wiki, check if file is in main wiki's tiddlers folder (or subfolder)
        const normalizedExisting = path.normalize(existingDirectory);
        const normalizedTarget = path.normalize(targetDirectory);

        // Check if existing file is within the target directory tree
        if (normalizedExisting.startsWith(normalizedTarget) || normalizedExisting === normalizedTarget) {
          // File is already in correct location, return existing fileInfo with overwrite flag
          return { ...existingFileInfo, overwrite: true };
        }
      }

      // Directory has changed (or no existing file), generate new file info
      if (matchingWiki) {
        return this.generateSubWikiFileInfo(tiddler, matchingWiki);
      } else {
        return this.generateDefaultFileInfo(tiddler);
      }
    } catch (error) {
      this.logger.alert(`filesystem: Error in getTiddlerFileInfo for "${title}":`, error);
      return this.generateDefaultFileInfo(tiddler);
    }
  }

  /**
   * Generate file info for sub-wiki directory
   * Handles symlinks correctly across platforms (Windows junctions and Linux symlinks)
   *
   * CRITICAL: We must temporarily remove the tiddler from boot.files before calling
   * generateTiddlerFileInfo, otherwise TiddlyWiki will use the old path as a base
   * and FileSystemPaths filters will apply repeatedly, causing path accumulation.
   */
  protected generateSubWikiFileInfo(tiddler: Tiddler, subWiki: IWikiWorkspace): IFileInfo {
    // Sub-wikis store tiddlers directly in their root folder (not in /tiddlers subfolder)
    // Only the main wiki uses /tiddlers because it has other meta files like .github
    let targetDirectory = subWiki.wikiFolderLocation;

    // Resolve symlinks to ensure consistent path handling across platforms
    // On Windows, this resolves junctions; on Linux, this resolves symbolic links
    // This prevents path inconsistencies when the same symlinked directory is referenced differently
    // (e.g., via the symlink path vs the real path)
    try {
      targetDirectory = fs.realpathSync(targetDirectory);
    } catch {
      // If realpath fails, use the original path
      // This can happen if the directory doesn't exist yet
    }

    $tw.utils.createDirectory(targetDirectory);

    const title = tiddler.fields.title;
    const oldFileInfo = this.boot.files[title];

    // Temporarily remove from boot.files to force fresh path generation
    if (oldFileInfo) {
      delete this.boot.files[title];
    }

    try {
      return $tw.utils.generateTiddlerFileInfo(tiddler, {
        directory: targetDirectory,
        pathFilters: undefined,
        extFilters: this.extensionFilters,
        wiki: this.wiki,
      });
    } finally {
      // Restore old fileInfo for potential cleanup in saveTiddler
      if (oldFileInfo) {
        this.boot.files[title] = oldFileInfo;
      }
    }
  }

  /**
   * Generate file info using default FileSystemPaths logic
   *
   * CRITICAL: We must temporarily remove the tiddler from boot.files before calling
   * generateTiddlerFileInfo, otherwise TiddlyWiki will use the old path as a base
   * and FileSystemPaths filters will apply repeatedly, causing path accumulation.
   */
  protected generateDefaultFileInfo(tiddler: Tiddler): IFileInfo {
    let pathFilters: string[] | undefined;

    if (this.wiki.tiddlerExists('$:/config/FileSystemPaths')) {
      const pathFiltersText = this.wiki.getTiddlerText('$:/config/FileSystemPaths', '');
      pathFilters = pathFiltersText.split('\n').filter(line => line.trim().length > 0);
    }

    const title = tiddler.fields.title;
    const oldFileInfo = this.boot.files[title];

    // Temporarily remove from boot.files to force fresh path generation
    if (oldFileInfo) {
      delete this.boot.files[title];
    }

    try {
      return $tw.utils.generateTiddlerFileInfo(tiddler, {
        directory: this.boot.wikiTiddlersPath ?? '',
        pathFilters,
        extFilters: this.extensionFilters,
        wiki: this.wiki,
      });
    } finally {
      // Restore old fileInfo for potential cleanup in saveTiddler
      if (oldFileInfo) {
        this.boot.files[title] = oldFileInfo;
      }
    }
  }

  /**
   * Save a tiddler to the filesystem
   * Can be used with callback (legacy) or as async/await
   */
  async saveTiddler(
    tiddler: Tiddler,
    callback?: (error: Error | null | string, adaptorInfo?: IFileInfo | null, revision?: string) => void,
    _options?: { tiddlerInfo?: Record<string, unknown> },
  ): Promise<void> {
    try {
      const fileInfo = this.getTiddlerFileInfo(tiddler);

      if (!fileInfo) {
        const error = new Error('No fileInfo returned from getTiddlerFileInfo');
        callback?.(error);
        throw error;
      }

      const savedFileInfo = await this.saveTiddlerWithRetry(tiddler, fileInfo);

      // Save old file info before updating, for cleanup to detect file path changes
      const oldFileInfo = this.boot.files[tiddler.fields.title];

      this.boot.files[tiddler.fields.title] = {
        ...savedFileInfo,
        isEditableFile: savedFileInfo.isEditableFile ?? true,
      };

      await new Promise<void>((resolve, reject) => {
        const cleanupOptions = {
          adaptorInfo: oldFileInfo, // Old file info to be deleted
          bootInfo: savedFileInfo, // New file info to be kept
          title: tiddler.fields.title,
        };
        $tw.utils.cleanupTiddlerFiles(cleanupOptions, (cleanupError: Error | null, _cleanedFileInfo?: IFileInfo) => {
          if (cleanupError) {
            reject(cleanupError);
            return;
          }
          resolve();
        });
      });

      callback?.(null, this.boot.files[tiddler.fields.title]);
    } catch (error) {
      const errorObject = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
      callback?.(errorObject);
      throw errorObject;
    }
  }

  /**
   * Load a tiddler - not needed as all tiddlers are loaded during boot
   */
  loadTiddler(
    _title: string,
    callback: (error: Error | null | string, tiddlerFields?: Record<string, unknown> | null) => void,
  ): void {
    callback(null, null);
  }

  /**
   * Delete a tiddler from the filesystem
   * Can be used with callback (legacy) or as async/await
   */
  async deleteTiddler(
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
      await new Promise<void>((resolve, reject) => {
        $tw.utils.deleteTiddlerFile(fileInfo, (error: Error | null, deletedFileInfo?: IFileInfo) => {
          if (error) {
            const errorCode = (error as NodeJS.ErrnoException).code;
            const errorSyscall = (error as NodeJS.ErrnoException).syscall;
            if ((errorCode === 'EPERM' || errorCode === 'EACCES') && errorSyscall === 'unlink') {
              this.logger.alert(`Server desynchronized. Error deleting file for deleted tiddler "${title}"`);
              callback?.(null, deletedFileInfo);
              resolve();
            } else {
              reject(error);
            }
            return;
          }

          this.removeTiddlerFileInfo(title);
          callback?.(null, null);
          resolve();
        });
      });
    } catch (error) {
      const errorObject = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
      callback?.(errorObject);
      throw errorObject;
    }
  }

  /**
   * Remove tiddler info from cache
   */
  removeTiddlerFileInfo(title: string): void {
    if (this.boot.files[title]) {
      delete this.boot.files[title];
    }
  }

  /**
   * Create an info tiddler to notify user about file save errors
   */
  protected createErrorNotification(title: string, error: Error, retryCount: number): void {
    const errorInfoTitle = `$:/temp/filesystem/error/${title}`;
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
    this.logger.alert(`filesystem: Created error notification for "${title}"`);
  }

  /**
   * Save tiddler with exponential backoff retry for file lock errors
   */
  protected async saveTiddlerWithRetry(
    tiddler: Tiddler,
    fileInfo: IFileInfo,
    options: { maxRetries?: number; initialDelay?: number; maxDelay?: number } = {},
  ): Promise<IFileInfo> {
    const maxRetries = options.maxRetries ?? 10;
    const initialDelay = options.initialDelay ?? 50;
    const maxDelay = options.maxDelay ?? 2000;

    try {
      return await backOff(
        async () => {
          return await new Promise<IFileInfo>((resolve, reject) => {
            $tw.utils.saveTiddlerToFile(tiddler, fileInfo, (saveError: Error | null, savedFileInfo?: IFileInfo) => {
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

            if (isFileLockError(errorCode)) {
              this.logger.log(
                `filesystem: File "${fileInfo.filepath}" is locked (${errorCode}), retrying (attempt ${attemptNumber}/${maxRetries})`,
              );
              return true;
            }

            this.logger.alert(`filesystem: Error saving "${tiddler.fields.title}":`, error);
            this.createErrorNotification(tiddler.fields.title, error, attemptNumber);
            return false;
          },
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const finalError = new Error(`Failed to save "${tiddler.fields.title}": ${errorMessage}`);
      this.createErrorNotification(tiddler.fields.title, finalError, maxRetries);
      throw finalError;
    }
  }
}
