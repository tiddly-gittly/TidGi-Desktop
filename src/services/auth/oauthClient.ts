/**
 * OAuth 2.0 client using oidc-client-ts
 * Simplified OAuth flow for Electron main process
 *
 * This wrapper adapts oidc-client-ts (designed for browsers) to work in Electron's main process.
 * We use oidc-client-ts for:
 * - PKCE generation (automatic)
 * - Token exchange
 * - State management
 *
 * But handle BrowserWindow navigation ourselves.
 */
import { getOAuthConfig } from '@/constants/oauthConfig';
import type { SupportedStorageServices } from '@services/types';
import type { OidcClientSettings, SigninResponse, StateStore } from 'oidc-client-ts';
import { OidcClient } from 'oidc-client-ts';
import { logger } from '../libs/log';

/**
 * In-memory state store for Electron main process (SINGLETON)
 * oidc-client-ts requires a state store to save PKCE verifiers and state
 * Must be a singleton to ensure state persists across OAuthClientManager instances
 */
class InMemoryStateStore implements StateStore {
  private static instance: InMemoryStateStore;
  private store = new Map<string, string>();

  // Private constructor for singleton pattern
  private constructor() {}

  public static getInstance(): InMemoryStateStore {
    if (!InMemoryStateStore.instance) {
      InMemoryStateStore.instance = new InMemoryStateStore();
      logger.debug('Singleton InMemoryStateStore created', { function: 'InMemoryStateStore.getInstance' });
    }
    return InMemoryStateStore.instance;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    logger.debug('State stored', { key, storeSize: this.store.size, function: 'InMemoryStateStore.set' });
  }

  async get(key: string): Promise<string | null> {
    const value = this.store.get(key) || null;
    logger.debug('State retrieved', { key, hasValue: !!value, storeSize: this.store.size, function: 'InMemoryStateStore.get' });
    return value;
  }

  async remove(key: string): Promise<string | null> {
    const value = this.store.get(key) || null;
    this.store.delete(key);
    logger.debug('State removed', { key, hadValue: !!value, storeSize: this.store.size, function: 'InMemoryStateStore.remove' });
    return value;
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

/**
 * OAuth client manager for a specific service
 * Keeps the OidcClient instance and provides helper methods
 */
export class OAuthClientManager {
  private client: OidcClient;
  private service: SupportedStorageServices;

  constructor(service: SupportedStorageServices) {
    const config = getOAuthConfig(service);
    if (!config) {
      throw new Error(`OAuth config not found for service: ${service}`);
    }

    this.service = service;

    // Configure oidc-client-ts for OAuth 2.0 (not OIDC)
    const settings: OidcClientSettings = {
      authority: config.authorizePath.replace(/\/login\/oauth\/.*$/, '') || 'https://example.com', // Dummy authority
      client_id: config.clientId,
      redirect_uri: config.redirectPath,
      response_type: 'code',
      scope: config.scopes,

      // Client secret for confidential clients
      ...(config.clientSecret && {
        client_secret: config.clientSecret,
      }),

      // Use singleton in-memory state store (main process doesn't have localStorage)
      stateStore: InMemoryStateStore.getInstance(),

      // Explicit metadata (no OIDC discovery)
      metadata: {
        issuer: config.authorizePath.replace(/\/login\/oauth\/.*$/, '') || 'https://example.com',
        authorization_endpoint: config.authorizePath,
        token_endpoint: config.tokenPath,
        userinfo_endpoint: config.userInfoPath,
      },

      // Disable OIDC-specific features
      loadUserInfo: false,
    };

    this.client = new OidcClient(settings);
    logger.debug('OAuth client created', { service, function: 'OAuthClientManager.constructor' });
  }

  /**
   * Create authorization URL
   * PKCE is automatically added by oidc-client-ts
   */
  async createAuthorizationUrl(): Promise<{ url: string } | undefined> {
    try {
      const request = await this.client.createSigninRequest({
        // oidc-client-ts will auto-generate state and PKCE
        state: undefined,
      });

      logger.debug('Authorization URL created', {
        service: this.service,
        hasState: !!request.state?.id,
        function: 'OAuthClientManager.createAuthorizationUrl',
      });

      return { url: request.url };
    } catch (error) {
      logger.error('Failed to create authorization URL', { service: this.service, error, function: 'OAuthClientManager.createAuthorizationUrl' });
      return undefined;
    }
  }

  /**
   * Exchange authorization code for access token
   * Handles PKCE verification automatically
   */
  async exchangeCodeForToken(
    callbackUrl: string,
  ): Promise<{ accessToken: string; error?: never } | { accessToken?: never; error: string }> {
    try {
      // Process the callback and exchange code for token
      const response: SigninResponse = await this.client.processSigninResponse(callbackUrl);

      if (!response.access_token) {
        return { error: 'No access token in response' };
      }

      logger.info('Token exchange successful', {
        service: this.service,
        tokenLength: response.access_token.length,
        function: 'OAuthClientManager.exchangeCodeForToken',
      });

      return { accessToken: response.access_token };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Token exchange failed', { service: this.service, error, function: 'OAuthClientManager.exchangeCodeForToken' });
      return { error: errorMessage };
    }
  }
}

/**
 * Create OAuth client manager for a service
 */
export function createOAuthClientManager(service: SupportedStorageServices): OAuthClientManager | undefined {
  try {
    return new OAuthClientManager(service);
  } catch (error) {
    logger.error('Failed to create OAuth client manager', { service, error, function: 'createOAuthClientManager' });
    return undefined;
  }
}
