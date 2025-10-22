import { SupportedStorageServices } from '@services/types';

export interface IOAuthConfig {
  /** OAuth authorization endpoint */
  authorizePath: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret (optional if using PKCE) */
  clientSecret?: string;
  /** Local redirect path for OAuth callback */
  redirectPath: string;
  /** OAuth scopes */
  scopes: string;
  /** Token exchange endpoint */
  tokenPath: string;
  /** Use PKCE (Proof Key for Code Exchange) instead of client_secret */
  usePKCE?: boolean;
  /** User info API endpoint */
  userInfoPath: string;
}

const BASE_REDIRECT_PATH = 'http://127.0.0.1:3012/tidgi-auth';

export const OAUTH_CONFIGS: Partial<Record<SupportedStorageServices, IOAuthConfig>> = {
  // Local test OAuth server (for development/testing)
  [SupportedStorageServices.local]: {
    authorizePath: 'http://127.0.0.1:8888/oauth/authorize',
    tokenPath: 'http://127.0.0.1:8888/oauth/access_token',
    userInfoPath: 'http://127.0.0.1:8888/api/user',
    clientId: 'test-client-id',
    usePKCE: true,
    redirectPath: `${BASE_REDIRECT_PATH}/local`,
    scopes: 'user:email,read:user,repo',
  },
  [SupportedStorageServices.github]: {
    authorizePath: 'https://github.com/login/oauth/authorize',
    tokenPath: 'https://github.com/login/oauth/access_token',
    userInfoPath: 'https://api.github.com/user',
    clientId: 'Ov23liyy2nhg5fwxC2Xn',
    // clientSecret not needed - using PKCE for security
    usePKCE: true,
    redirectPath: `${BASE_REDIRECT_PATH}/github`,
    scopes: 'user:email,read:user,repo,workflow',
  },
  [SupportedStorageServices.codeberg]: {
    authorizePath: 'https://codeberg.org/login/oauth/authorize',
    tokenPath: 'https://codeberg.org/login/oauth/access_token',
    userInfoPath: 'https://codeberg.org/api/v1/user',
    clientId: '0b008a26-9681-4139-9bf2-579df7c6d9cd',
    // clientSecret not needed - using PKCE for security
    usePKCE: true,
    redirectPath: `${BASE_REDIRECT_PATH}/codeberg`,
    scopes: 'read:user,write:repository',
  },
  // Gitea.com - official Gitea instance
  [SupportedStorageServices.gitea]: {
    authorizePath: 'https://gitea.com/login/oauth/authorize',
    tokenPath: 'https://gitea.com/login/oauth/access_token',
    userInfoPath: 'https://gitea.com/api/v1/user',
    clientId: '2e29bcd7-650b-4c4d-8482-26b44a0107cb',
    usePKCE: true, // PKCE is supported by Gitea
    redirectPath: `${BASE_REDIRECT_PATH}/gitea`,
    scopes: 'read:user,write:repository',
  },
  // Local Test OAuth Server (for testing only)
  [SupportedStorageServices.testOAuth]: {
    authorizePath: 'http://127.0.0.1:8888/oauth/authorize',
    tokenPath: 'http://127.0.0.1:8888/oauth/access_token',
    userInfoPath: 'http://127.0.0.1:8888/api/user',
    clientId: 'test-client-id',
    usePKCE: true,
    redirectPath: `${BASE_REDIRECT_PATH}/testOAuth`,
    scopes: 'user:email,read:user',
  },
};

/**
 * Get OAuth configuration for a service
 */
export function getOAuthConfig(service: SupportedStorageServices): IOAuthConfig | undefined {
  return OAUTH_CONFIGS[service];
}

/**
 * Generate PKCE code verifier and challenge
 * @returns { codeVerifier, codeChallenge }
 */
export function generatePKCEChallenge(): { codeVerifier: string } {
  // Generate random code_verifier (43-128 characters)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier };
}

/**
 * Compute SHA-256 hash for PKCE code_challenge
 */
async function sha256(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Build OAuth authorization URL
 */
export async function buildOAuthUrl(
  service: SupportedStorageServices,
): Promise<{ codeVerifier?: string; url: string } | undefined> {
  const config = getOAuthConfig(service);
  if (!config || !config.authorizePath || !config.clientId) {
    return undefined;
  }

  const queryParameters: Record<string, string> = {
    client_id: config.clientId,
    redirect_uri: config.redirectPath,
    scope: config.scopes,
  };

  let codeVerifier: string | undefined;

  // Add PKCE parameters if enabled
  if (config.usePKCE) {
    const pkce = generatePKCEChallenge();
    codeVerifier = pkce.codeVerifier;
    const codeChallenge = await sha256(codeVerifier);

    queryParameters.code_challenge = codeChallenge;
    queryParameters.code_challenge_method = 'S256';
  }

  const urlParameters = new URLSearchParams(queryParameters);
  const url = `${config.authorizePath}?${urlParameters.toString()}`;

  return { url, codeVerifier };
}

/**
 * Check if a URL matches any OAuth redirect path
 */
export function isOAuthRedirect(url: string): { service: SupportedStorageServices; config: IOAuthConfig } | undefined {
  for (const [service, config] of Object.entries(OAUTH_CONFIGS)) {
    if (config && url.startsWith(config.redirectPath)) {
      return { service: service as SupportedStorageServices, config };
    }
  }
  return undefined;
}
