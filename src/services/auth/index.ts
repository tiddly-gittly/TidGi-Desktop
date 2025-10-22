import { isOAuthRedirect } from '@/constants/oauthConfig';
import { container } from '@services/container';
import type { IDatabaseService } from '@services/database/interface';
import type { IGitUserInfos } from '@services/git/interface';
import { logger } from '@services/libs/log';
import serviceIdentifier from '@services/serviceIdentifier';
import { SupportedStorageServices } from '@services/types';
import type { IWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { BrowserWindow } from 'electron';
import { injectable } from 'inversify';
import { nanoid } from 'nanoid';
import { BehaviorSubject } from 'rxjs';
import type { IAuthenticationService, IUserInfos, ServiceBranchTypes, ServiceEmailTypes, ServiceTokenTypes, ServiceUserNameTypes } from './interface';

const defaultUserInfos = {
  userName: '',
};

@injectable()
export class Authentication implements IAuthenticationService {
  private cachedUserInfo: IUserInfos | undefined;
  public userInfo$ = new BehaviorSubject<IUserInfos | undefined>(undefined);

  // Store PKCE code_verifier in memory (per service)
  private pkceVerifierStore = new Map<SupportedStorageServices, string>();

  public storeOAuthVerifier(service: SupportedStorageServices, verifier: string): void {
    if (verifier) {
      this.pkceVerifierStore.set(service, verifier);
    } else {
      this.pkceVerifierStore.delete(service);
    }
  }

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
   * Setup OAuth redirect handler for a BrowserWindow
   * This intercepts OAuth callbacks and exchanges authorization codes for tokens
   * @param window The BrowserWindow to setup OAuth handling for
   * @param getMainWindowEntry Function to get the main window entry URL
   * @param preferencesPath The path to navigate to after OAuth completes
   */
  public setupOAuthRedirectHandler(
    window: BrowserWindow,
    getMainWindowEntry: () => string,
    preferencesPath: string,
  ): void {
    // Handle the actual redirect (before navigation happens)
    window.webContents.on('will-redirect', async (event, url) => {
      const oauthMatch = isOAuthRedirect(url);

      if (oauthMatch) {
        event.preventDefault(); // Prevent navigation to non-existent localhost:3012

        // Extract code from URL
        const urlObject = new URL(url);
        const code = urlObject.searchParams.get('code');

        if (code) {
          try {
            const requestBody: Record<string, string> = {
              client_id: oauthMatch.config.clientId,
              code,
            };

            // Use PKCE if enabled
            if (oauthMatch.config.usePKCE) {
              // Retrieve code_verifier from memory
              const codeVerifier = this.pkceVerifierStore.get(oauthMatch.service);

              if (codeVerifier) {
                requestBody.code_verifier = codeVerifier;
              }
            } else {
              // Use client_secret for legacy OAuth
              if (oauthMatch.config.clientSecret) {
                requestBody.client_secret = oauthMatch.config.clientSecret;
              }
            }

            // GitHub requires application/x-www-form-urlencoded for token exchange
            const formBody = new URLSearchParams(requestBody).toString();

            const response = await fetch(oauthMatch.config.tokenPath, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
              },
              body: formBody,
            });

            const responseData = await response.json() as { access_token?: string; error?: string; error_description?: string };
            const { access_token: token } = responseData;

            // Store token
            await this.set(`${oauthMatch.service}-token`, token);

            // Fetch user info if available
            if (token && oauthMatch.config.userInfoPath) {
              try {
                const userInfoResponse = await fetch(oauthMatch.config.userInfoPath, {
                  method: 'GET',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                  },
                });
                const userInfo = await userInfoResponse.json() as { email?: string; login?: string; name?: string };

                if (userInfo.login) {
                  await this.set(`${oauthMatch.service}-userName`, userInfo.login);
                }
                if (userInfo.email) {
                  await this.set(`${oauthMatch.service}-email`, userInfo.email);
                }
              } catch {
                // Silently fail on user info fetch
              }
            }

            // Force immediate save to disk (bypass debounce)
            const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
            await databaseService.immediatelyStoreSettingsToFile();

            // Wait a bit to ensure file system has synced
            await new Promise(resolve => setTimeout(resolve, 100));

            // Clear code_verifier from memory
            this.pkceVerifierStore.delete(oauthMatch.service);

            // Load preferences page directly
            await window.webContents.loadURL(`${getMainWindowEntry()}#/${preferencesPath}`);
          } catch {
            await window.webContents.loadURL(`${getMainWindowEntry()}#/${preferencesPath}`);
          }
        }
      }
    });

    // Also handle will-navigate as a fallback (in case will-redirect doesn't fire)
    window.webContents.on('will-navigate', async (event, url) => {
      const oauthMatch = isOAuthRedirect(url);

      if (oauthMatch) {
        event.preventDefault();

        // Extract code and process (same as will-redirect)
        const urlObject = new URL(url);
        const code = urlObject.searchParams.get('code');

        if (code) {
          try {
            const requestBody: Record<string, string> = {
              client_id: oauthMatch.config.clientId,
              code,
            };

            if (oauthMatch.config.usePKCE) {
              // Retrieve code_verifier from memory
              const codeVerifier = this.pkceVerifierStore.get(oauthMatch.service);

              if (codeVerifier) {
                requestBody.code_verifier = codeVerifier;
              }
            } else if (oauthMatch.config.clientSecret) {
              requestBody.client_secret = oauthMatch.config.clientSecret;
            }

            // GitHub requires application/x-www-form-urlencoded for token exchange
            const formBody = new URLSearchParams(requestBody).toString();

            const response = await fetch(oauthMatch.config.tokenPath, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
              },
              body: formBody,
            });

            const responseData = await response.json() as { access_token?: string; error?: string; error_description?: string };
            const { access_token: token } = responseData;

            await this.set(`${oauthMatch.service}-token`, token);

            // Fetch user info if available
            if (token && oauthMatch.config.userInfoPath) {
              try {
                const userInfoResponse = await fetch(oauthMatch.config.userInfoPath, {
                  method: 'GET',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                  },
                });
                const userInfo = await userInfoResponse.json() as { email?: string; login?: string; name?: string };

                if (userInfo.login) {
                  await this.set(`${oauthMatch.service}-userName`, userInfo.login);
                }
                if (userInfo.email) {
                  await this.set(`${oauthMatch.service}-email`, userInfo.email);
                }
              } catch {
                // Silently fail on user info fetch
              }
            }

            // Force immediate save to disk (bypass debounce)
            const databaseService = container.get<IDatabaseService>(serviceIdentifier.Database);
            await databaseService.immediatelyStoreSettingsToFile();

            // Wait a bit to ensure file system has synced
            await new Promise(resolve => setTimeout(resolve, 100));

            // Clear code_verifier from memory
            this.pkceVerifierStore.delete(oauthMatch.service);

            // Navigate back to preferences
            await window.webContents.loadURL(`${getMainWindowEntry()}#/${preferencesPath}`);
          } catch {
            await window.webContents.loadURL(`${getMainWindowEntry()}#/${preferencesPath}`);
          }
        }
      }
    });
  }
}
