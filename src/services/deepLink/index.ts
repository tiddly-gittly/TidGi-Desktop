import { lazyInject } from '@services/container';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWorkspaceService } from '@services/workspaces/interface';
import { app } from 'electron';
import { injectable } from 'inversify';
import path from 'node:path';
import { IDeepLinkService } from './interface';

@injectable()
export class DeepLinkService implements IDeepLinkService {
  @lazyInject(serviceIdentifier.Workspace)
  private readonly workspaceService!: IWorkspaceService;

  /**
   * Handle link and open the workspace.
   * @param requestUrl like `tidgi://lxqsftvfppu_z4zbaadc0/#:Index` or `tidgi://lxqsftvfppu_z4zbaadc0/#%E6%96%B0%E6%9D%A1%E7%9B%AE`
   */
  private readonly deepLinkHandler: (requestUrl: string) => Promise<void> = async (requestUrl) => {
    logger.info(`Receiving deep link`, { requestUrl, function: 'deepLinkHandler' });
    // hostname is workspace id or name
    const { hostname, hash } = new URL(requestUrl);
    let workspace = await this.workspaceService.get(hostname);
    if (workspace === undefined) {
      logger.error(`Workspace not found, try get by name`, { hostname, function: 'deepLinkHandler' });
      workspace = await this.workspaceService.getByWikiName(hostname);
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
    logger.info(`Open deep link`, { workspaceId: workspace.id, tiddlerName, function: 'deepLinkHandler' });
    await this.workspaceService.openWorkspaceTiddler(workspace, tiddlerName);
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
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.deepLinkHandler(url);
    });
  }

  private setupWindowsLinuxHandler(): void {
    const gotTheLock = app.requestSingleInstanceLock();

    if (gotTheLock) {
      app.on('second-instance', (event, commandLine) => {
        const url = commandLine.pop();
        if (url !== undefined && url !== '') {
          this.deepLinkHandler(url);
        }
      });
    } else {
      app.quit();
    }
  }
}
