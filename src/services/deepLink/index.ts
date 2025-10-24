import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';
import { app } from 'electron';
import { inject, injectable } from 'inversify';
import path from 'node:path';
import type { IDeepLinkService } from './interface';

@injectable()
export class DeepLinkService implements IDeepLinkService {
  constructor(
    @inject(serviceIdentifier.Workspace) private readonly workspaceService: IWorkspaceService,
  ) {}
  /**
   * Sanitize tiddler name to prevent injection attacks.
   * This escapes potentially dangerous characters while preserving the original content.
   * TiddlyWiki recommends avoiding: | [ ] { } in tiddler titles
   *
   * And in the place that use this (wikiOperations/executor/scripts/*.ts), we also use JSON.stringify to exclude "`".
   * @param tiddlerName The tiddler name to sanitize
   * @returns Sanitized tiddler name
   */
  private sanitizeTiddlerName(tiddlerName: string): string {
    let sanitized = tiddlerName;

    // Remove null bytes (these should never appear in valid text)
    sanitized = sanitized.replace(/\0/g, '');

    // Replace newlines and tabs with spaces to prevent breaking out of string context
    sanitized = sanitized.replace(/[\r\n\t]/g, ' ');

    // Remove HTML tags to prevent XSS
    sanitized = sanitized.replace(/<\/?[^>]+(>|$)/g, '');

    // Remove TiddlyWiki special characters that could cause parsing issues
    sanitized = sanitized.replace(/[|[\]{}]/g, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    // Limit length to prevent DoS
    if (sanitized.length > 1000) {
      sanitized = sanitized.substring(0, 1000);
      logger.warn(`Tiddler name truncated to 1000 characters for security`, { original: tiddlerName.substring(0, 50), function: 'sanitizeTiddlerName' });
    }

    return sanitized;
  }

  /**
   * Handle link and open the workspace.
   * @param requestUrl like `tidgi://lxqsftvfppu_z4zbaadc0/#:Index` or `tidgi://lxqsftvfppu_z4zbaadc0/#%E6%96%B0%E6%9D%A1%E7%9B%AE`
   */
  private readonly deepLinkHandler: (requestUrl: string) => Promise<void> = async (requestUrl) => {
    logger.info(`Receiving deep link`, { requestUrl, function: 'deepLinkHandler' });
    try {
      // hostname is workspace id or name
      const { hostname, hash, pathname } = new URL(requestUrl);
      let workspace = await this.workspaceService.get(hostname);
      if (workspace === undefined) {
        logger.info(`Workspace not found, try get by name`, { hostname, function: 'deepLinkHandler' });
        let workspaceName = hostname;
        // Host name can't use Chinese or it becomes `xn--1-376ap73a`, so use `w` host, and get workspace name from path
        if (hostname === 'w') {
          workspaceName = decodeURIComponent(pathname.split('/')[1] ?? '');
          logger.info(`Workspace name from w/`, { hostname, pathname, workspaceName, function: 'deepLinkHandler' });
        }
        workspace = await this.workspaceService.getByWikiName(workspaceName);
        if (workspace === undefined) {
          return;
        }
      }
      let tiddlerName = hash.substring(1); // remove '#:'
      if (tiddlerName.includes(':')) {
        tiddlerName = tiddlerName.split(':')[1];
      }
      // Support CJK
      tiddlerName = decodeURIComponent(tiddlerName);

      // Sanitize tiddler name to prevent injection attacks
      tiddlerName = this.sanitizeTiddlerName(tiddlerName);

      // Validate that tiddler name is not empty after sanitization
      if (!tiddlerName || tiddlerName.length === 0) {
        logger.warn(`Invalid or empty tiddler name after sanitization`, { original: hash, function: 'deepLinkHandler' });
        return;
      }

      logger.info(`Open deep link`, { workspaceId: workspace.id, tiddlerName, function: 'deepLinkHandler' });
      await this.workspaceService.openWorkspaceTiddler(workspace, tiddlerName);
    } catch (error) {
      logger.error(`Invalid URL`, { requestUrl, error, function: 'deepLinkHandler' });
    }
  };

  public initializeDeepLink(protocol: string) {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient(protocol);
    }

    if (process.platform === 'darwin') {
      this.setupMacOSHandler();
    } else {
      this.setupWindowsLinuxHandler();
    }
  }

  private setupMacOSHandler(): void {
    app.on('open-url', (_event, url) => {
      _event.preventDefault();
      void this.deepLinkHandler(url);
    });
  }

  private setupWindowsLinuxHandler(): void {
    const gotTheLock = app.requestSingleInstanceLock();

    if (gotTheLock) {
      app.on('second-instance', (_event, commandLine) => {
        const url = commandLine.pop();
        if (url !== undefined && url !== '') {
          void this.deepLinkHandler(url);
        }
      });
    } else {
      app.quit();
    }
  }
}
