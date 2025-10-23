import { getOAuthConfig } from '@/constants/oauthConfig';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IGitUserInfos } from '@services/git/interface';
import { logger } from '@services/libs/log';
import type { IMenuService } from '@services/menu/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { BrowserWindow } from 'electron';
import { injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject } from 'rxjs';
import type { IAuthenticationService, IUserInfos, ServiceBranchTypes, ServiceEmailTypes, ServiceTokenTypes, ServiceUserNameTypes } from './interface';
import { setupOAuthRedirectHandler as setupOAuthHandler } from './oauthRedirectHandler';

const defaultUserInfos = {
  userName: '',
};

@injectable()
export class Authentication implements IAuthenticationService {
  private cachedUserInfo: IUserInfos | undefined;
  public userInfo$ = new BehaviorSubject<IUserInfos | undefined>(undefined);

  public updateUserInfoSubject(): void {
    this.userInfo$.next(this.getUserInfos());
  }

  public async getStorageServiceUserInfo(serviceName: SupportedStorageServices): Promise<IGitUserInfos | undefined> {
    const gitUserName = await this.get((serviceName + '-userName') as ServiceUserNameTypes);
    const email = await this.get((serviceName + '-email') as ServiceEmailTypes);
    const accessToken = await this.get((serviceName + '-token') as ServiceTokenTypes);
    const branch = (await this.get((serviceName + '-branch') as ServiceBranchTypes)) ?? 'main';
    if (gitUserName !== undefined && accessToken !== undefined) {
      return {
        gitUserName,
        email,
        accessToken,
        branch,
      };
    }
  }

  public async getRandomStorageServiceUserInfo(): Promise<{ info: IGitUserInfos; name: SupportedStorageServices } | undefined> {
    for (const serviceName of Object.values(SupportedStorageServices)) {
      const info = await this.getStorageServiceUserInfo(serviceName);
      if (info?.accessToken !== undefined && info.accessToken.length > 0 && info.email !== undefined && info.gitUserName !== undefined) {
        return { name: serviceName, info };
      }
    }
  }

  /**
   * load UserInfos in sync, and ensure it is an Object
   */
  private readonly getInitUserInfoForCache = (): IUserInfos => {
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    let userInfosFromDisk: Partial<IUserInfos> = databaseService.getSetting('userInfos') ?? {};
    userInfosFromDisk = typeof userInfosFromDisk === 'object' && !Array.isArray(userInfosFromDisk) ? userInfosFromDisk : {};
    return { ...defaultUserInfos, ...userInfosFromDisk };
  };

  private sanitizeUserInfo(info: Partial<IUserInfos>): Partial<IUserInfos> {
    return { ...info, 'github-branch': info['github-branch'] ?? 'main' };
  }

  public setUserInfos(newUserInfos: IUserInfos): void {
    this.cachedUserInfo = newUserInfos;
    const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
    databaseService.setSetting('userInfos', newUserInfos);
    this.updateUserInfoSubject();
  }

  public getUserInfos(): IUserInfos {
    // store in memory to boost performance
    if (this.cachedUserInfo === undefined) {
      this.cachedUserInfo = this.getInitUserInfoForCache();
    }
    return this.cachedUserInfo;
  }

  public async get<K extends keyof IUserInfos>(key: K): Promise<IUserInfos[K] | undefined> {
    const userInfo = this.getUserInfos();
    if (userInfo[key] !== null && userInfo[key] !== undefined) {
      return userInfo[key];
    }
  }

  public async set<K extends keyof IUserInfos>(key: K, value: IUserInfos[K]): Promise<void> {
    let userInfo = this.getUserInfos();
    userInfo[key] = value;
    userInfo = { ...userInfo, ...this.sanitizeUserInfo(userInfo) };
    this.setUserInfos(userInfo);
  }

  public async reset(): Promise<void> {
    this.setUserInfos(defaultUserInfos);
  }

  public async generateOneTimeAdminAuthTokenForWorkspace(workspaceID: string): Promise<string> {
    return this.generateOneTimeAdminAuthTokenForWorkspaceSync(workspaceID);
  }

  public generateOneTimeAdminAuthTokenForWorkspaceSync(workspaceID: string): string {
    const newAuthToken = nanoid().toLowerCase();
    logger.debug('new auth token generated', { workspaceID, newAuthToken, function: 'generateOneTimeAdminAuthTokenForWorkspace' });
    return newAuthToken;
  }

  /**
   * use workspace specific userName first, and fall back to preferences' userName, pass empty editor username if undefined
   * @param workspace the workspace to get userName setting from
   */
  public async getUserName(workspace: IWorkspace): Promise<string> {
    const userName = (isWikiWorkspace(workspace) ? workspace.userName : '') || (await this.get('userName')) || '';
    return userName;
  }

  /**
   * Clear cookies for a specific OAuth domain
   * Used during logout to clear "remember me" state
   */
  public async clearCookiesForDomain(domain: string): Promise<void> {
    const { session } = await import('electron');
    try {
      const cookies = await session.defaultSession.cookies.get({ domain });

      await Promise.all(
        cookies.map(async (cookie) => {
          const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
          await session.defaultSession.cookies.remove(url, cookie.name);
        }),
      );
    } catch (error) {
      logger.error('Failed to clear cookies for domain', { error, domain, function: 'clearCookiesForDomain' });
      throw error;
    }
  }

  /**
   * Generate OAuth authorization URL using oidc-client-ts
   * This ensures PKCE state is properly managed
   */
  public async generateOAuthUrl(service: SupportedStorageServices): Promise<string | undefined> {
    try {
      const { createOAuthClientManager } = await import('./oauthClient');
      const client = createOAuthClientManager(service);

      if (!client) {
        logger.error('Failed to create OAuth client', { service, function: 'generateOAuthUrl' });
        return undefined;
      }

      const result = await client.createAuthorizationUrl();
      if (!result) {
        logger.error('Failed to generate OAuth URL', { service, function: 'generateOAuthUrl' });
        return undefined;
      }

      logger.info('OAuth URL generated', { service, function: 'generateOAuthUrl' });
      return result.url;
    } catch (error) {
      logger.error('Error generating OAuth URL', { service, error, function: 'generateOAuthUrl' });
      return undefined;
    }
  }

  /**
   * Open OAuth login in a new popup window
   * The window will be automatically closed after OAuth completes
   * @param service - The OAuth service to authenticate with (e.g., 'github')
   */
  public async openOAuthWindow(service: SupportedStorageServices): Promise<void> {
    try {
      // Generate OAuth URL using oidc-client-ts (ensures proper state management)
      const url = await this.generateOAuthUrl(service);
      if (!url) {
        throw new Error(`Failed to generate OAuth URL for ${service}`);
      }

      logger.info('Opening OAuth window', { function: 'openOAuthWindow', service, url: url.substring(0, 100) });

      // Create a new popup window for OAuth
      const oauthWindow = new BrowserWindow({
        width: 600,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        title: 'OAuth Login',
        resizable: true,
        minimizable: false,
        fullscreenable: false,
        show: false, // Don't show until ready
      });

      // Show window when ready
      oauthWindow.once('ready-to-show', () => {
        oauthWindow.show();
        logger.debug('OAuth window shown', { function: 'openOAuthWindow' });
      });

      // Add context menu (right-click menu with DevTools) for debugging
      const menuService = container.get<IMenuService>(serviceIdentifier.MenuService);
      const unregisterContextMenu = await menuService.initContextMenuForWindowWebContents(oauthWindow.webContents);
      
      // Clean up context menu when window is closed
      oauthWindow.on('closed', () => {
        unregisterContextMenu();
      });

      // Setup OAuth redirect handler for this window
      this.setupOAuthRedirectHandler(
        oauthWindow,
        () => '', // Not needed for popup window
        '', // Not needed for popup window
        false, // Don't navigate after auth - just close the window
      );

      // Clean up if window is closed manually
      oauthWindow.on('closed', () => {
        logger.info('OAuth window closed', { function: 'openOAuthWindow' });
      });

      // Load OAuth URL
      await oauthWindow.loadURL(url);
      logger.debug('OAuth URL loaded in popup window', { function: 'openOAuthWindow' });
    } catch (error) {
      logger.error('Failed to open OAuth window', { error, function: 'openOAuthWindow' });
      throw error;
    }
  }

  /**
   * Setup OAuth redirect handler for a BrowserWindow (simplified version using oidc-client-ts)
   * @param window The BrowserWindow to setup OAuth handling for
   * @param getMainWindowEntry Function to get the main window entry URL
   * @param preferencesPath The path to navigate to after OAuth completes
   * @param shouldNavigateAfterAuth Whether to navigate after authentication (false for popup windows)
   */
  public setupOAuthRedirectHandler(
    window: BrowserWindow,
    getMainWindowEntry: () => string,
    preferencesPath: string,
    shouldNavigateAfterAuth = true,
  ): void {
    const handleSuccess = async (service: SupportedStorageServices, accessToken: string) => {
      logger.info('OAuth authentication successful', {
        service,
        tokenLength: accessToken.length,
        function: 'setupOAuthRedirectHandler.handleSuccess',
      });

      try {
        // Store access token
        await this.set(`${service}-token`, accessToken);
        logger.debug('Access token stored', { service, function: 'setupOAuthRedirectHandler.handleSuccess' });

        // Fetch and store user info
        const config = getOAuthConfig(service);
        if (config?.userInfoPath) {
          try {
            const response = await fetch(config.userInfoPath, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
              },
            });

            const userInfo = await response.json() as { email?: string; login?: string; name?: string };

            if (userInfo.login) {
              await this.set(`${service}-userName`, userInfo.login);
              logger.debug('User name stored', { service, userName: userInfo.login });
            }
            if (userInfo.email) {
              await this.set(`${service}-email`, userInfo.email);
              logger.debug('User email stored', { service, email: userInfo.email });
            }
          } catch (error) {
            logger.warn('Failed to fetch user info', { service, error });
          }
        }

        // Force immediate save to disk
        const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
        await databaseService.immediatelyStoreSettingsToFile();
        logger.debug('Settings saved to disk', { service });

        // Update observable
        this.updateUserInfoSubject();
        logger.debug('UserInfo observable updated', { service });

        // Navigate or close window
        if (shouldNavigateAfterAuth) {
          const targetUrl = `${getMainWindowEntry()}#/${preferencesPath}`;
          await window.webContents.loadURL(targetUrl);
          logger.info('Navigated to preferences', { service, targetUrl });
        } else {
          if (!window.isDestroyed()) {
            window.close();
          }
          logger.info('OAuth popup window closed', { service });
        }
      } catch (error) {
        logger.error('Error handling OAuth success', { service, error });
        throw error;
      }
    };

    const handleError = async (service: SupportedStorageServices, error: string) => {
      logger.error('OAuth authentication failed', {
        service,
        error,
        function: 'setupOAuthRedirectHandler.handleError',
      });

      // Navigate back to preferences on error (if not a popup)
      if (shouldNavigateAfterAuth) {
        const targetUrl = `${getMainWindowEntry()}#/${preferencesPath}`;
        await window.webContents.loadURL(targetUrl);
        logger.debug('Navigated to preferences after error', { service });
      } else {
        if (!window.isDestroyed()) {
          window.close();
        }
        logger.debug('OAuth popup window closed after error', { service });
      }
    };

    // Use the simplified redirect handler from oauthRedirectHandler.ts
    setupOAuthHandler(window, handleSuccess, handleError);
  }
}
