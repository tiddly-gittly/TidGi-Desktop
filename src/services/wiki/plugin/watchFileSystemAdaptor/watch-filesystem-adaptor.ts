/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { Logger } from '$:/core/modules/utils/logger.js';
import type { FileInfo } from '$:/core/modules/utils/utils.js';
import { workspace } from '@services/wiki/wikiWorker/services';
import type { IWikiWorkspace, IWorkspace } from '@services/workspaces/interface';
import path from 'path';
import type { Tiddler, Wiki } from 'tiddlywiki';

type IFileSystemAdaptorCallback = (error: Error | null | string, fileInfo?: FileInfo | null) => void;

/**
 * Enhanced filesystem adaptor that routes tiddlers to sub-wikis based on tags.
 * Queries workspace information from main process via worker IPC.
 *
 * Unlike the original approach that modifies $:/config/FileSystemPaths with complex string manipulation,
 * this adaptor directly checks tiddler tags against workspace tagName and routes to appropriate directories.
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
    }

    // Initialize extension filters cache (cached for performance, requires restart to reflect changes)
    this.initializeExtensionFiltersCache();

    // Initialize sub-wikis cache
    void this.updateSubWikisCache();
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
      this.logger.alert('Failed to update sub-wikis cache:', error);
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
        this.logger.log(`Routing tiddler "${title}" to sub-wiki: ${matchingSubWiki.name}`);
        return this.generateSubWikiFileInfo(tiddler, matchingSubWiki, fileInfo);
      } else {
        // Use default FileSystemPaths logic
        return this.generateDefaultFileInfo(tiddler, fileInfo);
      }
    } catch (error) {
      this.logger.alert(`Error in getTiddlerFileInfo for "${title}":`, error);
      // Fall back to default logic on error
      return this.generateDefaultFileInfo(tiddler, fileInfo);
    }
  }

  /**
   * Generate file info for sub-wiki directory
   */
  private generateSubWikiFileInfo(tiddler: Tiddler, subWiki: IWikiWorkspace, fileInfo: FileInfo | undefined): FileInfo {
    const targetDirectory = path.join(subWiki.wikiFolderLocation, 'tiddlers');

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
    try {
      // Get file info directly
      const fileInfo = await this.getTiddlerFileInfo(tiddler);

      if (!fileInfo) {
        callback(new Error('No fileInfo returned from getTiddlerFileInfo'));
        return;
      }

      // Save tiddler to file
      $tw.utils.saveTiddlerToFile(tiddler, fileInfo, (saveError: Error | null, savedFileInfo?: FileInfo) => {
        if (saveError) {
          const errorCode = (saveError as NodeJS.ErrnoException).code;
          if (errorCode === 'EPERM' || errorCode === 'EACCES') {
            this.logger.alert('Error saving file, will be retried with encoded filepath', savedFileInfo ? encodeURIComponent(savedFileInfo.filepath) : 'unknown');
          }
          callback(saveError);
          return;
        }

        if (!savedFileInfo) {
          callback(new Error('No fileInfo returned from saveTiddlerToFile'));
          return;
        }

        // Store new boot info only after successful writes
        // Ensure isEditableFile is set (required by IBootFilesIndexItem)
        this.boot.files[tiddler.fields.title] = {
          ...savedFileInfo,
          isEditableFile: savedFileInfo.isEditableFile ?? true,
        };

        // Cleanup duplicates if the file moved or changed extensions
        const cleanupOptions = {
          adaptorInfo: options?.tiddlerInfo as FileInfo | undefined,
          bootInfo: savedFileInfo,
          title: tiddler.fields.title,
        };
        $tw.utils.cleanupTiddlerFiles(cleanupOptions, (cleanupError: Error | null, cleanedFileInfo?: FileInfo) => {
          if (cleanupError) {
            callback(cleanupError);
            return;
          }
          callback(null, cleanedFileInfo);
        });
      });
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
}

// Only export in Node.js environment
if ($tw.node) {
  exports.adaptorClass = WatchFileSystemAdaptor;
}
