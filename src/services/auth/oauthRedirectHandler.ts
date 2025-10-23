/**
 * Simplified OAuth redirect handler using oidc-client-ts
 * Replaces the complex manual implementation in auth/index.ts
 */
import { isOAuthRedirect } from '@/constants/oauthConfig';
import type { SupportedStorageServices } from '@services/types';
import type { BrowserWindow } from 'electron';
import { logger } from '../libs/log';
import { createOAuthClientManager } from './oauthClient';

/**
 * Setup OAuth redirect handler for a BrowserWindow
 * Uses oidc-client-ts to handle token exchange
 *
 * @param window - The BrowserWindow to monitor for OAuth redirects
 * @param onSuccess - Callback when OAuth completes successfully with access token
 * @param onError - Callback when OAuth fails
 */
export function setupOAuthRedirectHandler(
  window: BrowserWindow,
  onSuccess: (service: SupportedStorageServices, accessToken: string) => Promise<void>,
  onError: (service: SupportedStorageServices, error: string) => Promise<void>,
): void {
  logger.info('Setting up simplified OAuth redirect handler', { function: 'setupOAuthRedirectHandler' });

  /**
   * Handle OAuth redirect (will-redirect event fires before navigation)
   */
  window.webContents.on('will-redirect', async (event, url) => {
    const oauthMatch = isOAuthRedirect(url);

    if (!oauthMatch) {
      return; // Not an OAuth redirect, ignore
    }

    logger.info('OAuth redirect detected', {
      service: oauthMatch.service,
      url: url.substring(0, 100), // Log first 100 chars
      function: 'setupOAuthRedirectHandler.will-redirect',
    });

    // Prevent navigation to non-existent localhost:3012
    event.preventDefault();

    try {
      // Create OAuth client for this service
      const client = createOAuthClientManager(oauthMatch.service);
      if (!client) {
        throw new Error(`Failed to create OAuth client for ${oauthMatch.service}`);
      }

      // Use oidc-client-ts to exchange code for token
      const result = await client.exchangeCodeForToken(url);

      if (result.error) {
        logger.error('Token exchange failed', {
          service: oauthMatch.service,
          error: result.error,
          function: 'setupOAuthRedirectHandler.will-redirect',
        });
        await onError(oauthMatch.service, result.error);
        return;
      }

      logger.info('Token exchange successful', {
        service: oauthMatch.service,
        tokenLength: result.accessToken?.length || 0,
        function: 'setupOAuthRedirectHandler.will-redirect',
      });

      // Call success callback
      if (result.accessToken) {
        await onSuccess(oauthMatch.service, result.accessToken);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('OAuth redirect handler error', {
        service: oauthMatch.service,
        error: errorMessage,
        function: 'setupOAuthRedirectHandler.will-redirect',
      });
      await onError(oauthMatch.service, errorMessage);
    }
  });

  /**
   * Handle did-fail-load (connection to localhost:3012 fails as expected)
   */
  window.webContents.on('did-fail-load', async (_, errorCode, __, validatedURL) => {
    // Only handle -102 (ERR_CONNECTION_REFUSED) for localhost redirects
    if (errorCode !== -102) {
      return;
    }

    const oauthMatch = isOAuthRedirect(validatedURL);
    if (!oauthMatch) {
      return;
    }

    logger.info('OAuth redirect detected via did-fail-load', {
      service: oauthMatch.service,
      errorCode,
      function: 'setupOAuthRedirectHandler.did-fail-load',
    });

    try {
      const client = createOAuthClientManager(oauthMatch.service);
      if (!client) {
        throw new Error(`Failed to create OAuth client for ${oauthMatch.service}`);
      }

      const result = await client.exchangeCodeForToken(validatedURL);

      if (result.error) {
        logger.error('Token exchange failed (did-fail-load)', {
          service: oauthMatch.service,
          error: result.error,
          function: 'setupOAuthRedirectHandler.did-fail-load',
        });
        await onError(oauthMatch.service, result.error);
        return;
      }

      logger.info('Token exchange successful (did-fail-load)', {
        service: oauthMatch.service,
        tokenLength: result.accessToken?.length || 0,
        function: 'setupOAuthRedirectHandler.did-fail-load',
      });

      if (result.accessToken) {
        await onSuccess(oauthMatch.service, result.accessToken);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('OAuth redirect handler error (did-fail-load)', {
        service: oauthMatch.service,
        error: errorMessage,
        function: 'setupOAuthRedirectHandler.did-fail-load',
      });
      await onError(oauthMatch.service, errorMessage);
    }
  });

  logger.debug('OAuth redirect handler setup complete', { function: 'setupOAuthRedirectHandler' });
}
