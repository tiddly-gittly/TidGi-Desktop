import { createHash, randomBytes } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { generateOAuthLoginPage } from './oauthLoginPage';

interface OAuthConfig {
  clientId: string;
  /** For testing purposes, we accept any redirect_uri */
  allowAnyRedirectUri?: boolean;
  /** Enable PKCE support */
  supportPKCE?: boolean;
}

interface AuthorizationCode {
  code: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  redirectUri: string;
  timestamp: number;
}

export class MockOAuthServer {
  private server: Server | null = null;
  public port = 0;
  public baseUrl = '';
  private config: OAuthConfig;
  private authorizationCodes = new Map<string, AuthorizationCode>();
  private accessTokens = new Map<string, { token: string; timestamp: number }>();

  constructor(config: OAuthConfig, private fixedPort?: number) {
    this.config = {
      allowAnyRedirectUri: true,
      supportPKCE: true,
      ...config,
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((request: IncomingMessage, response: ServerResponse) => {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (request.method === 'OPTIONS') {
          if (!response.writableEnded && !response.headersSent) {
            response.writeHead(200);
            response.end();
          }
          return;
        }

        try {
          const url = new URL(request.url || '', `http://127.0.0.1:${this.port}`);

          // Health check
          if (request.method === 'GET' && url.pathname === '/health') {
            if (!response.writableEnded && !response.headersSent) {
              response.writeHead(200, { 'Content-Type': 'application/json' });
              response.end(JSON.stringify({ status: 'ok' }));
            }
            return;
          }

          // Authorization endpoint - GET /oauth/authorize
          if (request.method === 'GET' && url.pathname === '/oauth/authorize') {
            void this.handleAuthorize(url, response);
            return;
          }

          // Login form submission - POST /oauth/login
          if (request.method === 'POST' && url.pathname === '/oauth/login') {
            void this.handleLogin(request, response);
            return;
          }

          // Token exchange endpoint - POST /oauth/access_token
          if (request.method === 'POST' && url.pathname === '/oauth/access_token') {
            void this.handleTokenExchange(request, response);
            return;
          }

          // User info endpoint - GET /api/user
          if (request.method === 'GET' && url.pathname === '/api/user') {
            void this.handleUserInfo(request, response);
            return;
          }

          if (!response.writableEnded && !response.headersSent) {
            response.writeHead(404, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Not found' }));
          }
        } catch {
          if (!response.writableEnded && !response.headersSent) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Bad request' }));
          }
        }
      });

      this.server.on('error', (error) => {
        reject(new Error(String(error)));
      });

      this.server.on('listening', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve();
      });

      try {
        this.server.listen(this.fixedPort || 0, '127.0.0.1');
      } catch (error) {
        reject(new Error(String(error)));
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.closeAllConnections?.();
      this.server!.close(() => {
        this.server = null;
        resolve();
      });

      setTimeout(() => {
        if (this.server) {
          this.server = null;
          resolve();
        }
      }, 1000);
    });
  }

  private async handleAuthorize(url: URL, response: ServerResponse) {
    const parameters = url.searchParams;
    const clientId = parameters.get('client_id');
    const redirectUri = parameters.get('redirect_uri');
    const codeChallenge = parameters.get('code_challenge');
    const codeChallengeMethod = parameters.get('code_challenge_method');
    const state = parameters.get('state');

    // Validate client_id
    if (clientId !== this.config.clientId) {
      if (!response.writableEnded && !response.headersSent) {
        response.writeHead(400, { 'Content-Type': 'text/html' });
        response.end('<h1>Error: Invalid client_id</h1>');
      }
      return;
    }

    if (!redirectUri) {
      if (!response.writableEnded && !response.headersSent) {
        response.writeHead(400, { 'Content-Type': 'text/html' });
        response.end('<h1>Error: Missing redirect_uri</h1>');
      }
      return;
    }

    // Show login page (simulating GitHub's login flow)
    const loginPageHtml = generateOAuthLoginPage(clientId, redirectUri, codeChallenge, codeChallengeMethod, state);

    if (!response.writableEnded && !response.headersSent) {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(loginPageHtml);
    }
  }

  private async handleLogin(request: IncomingMessage, response: ServerResponse) {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    request.on('end', () => {
      try {
        // Parse form data
        const formData = new URLSearchParams(body);
        const username = formData.get('username');
        const password = formData.get('password');
        const authParametersString = formData.get('auth_params');

        // In test mode, accept any credentials
        // In a real OAuth server, you would validate credentials here
        if (!username || !password) {
          if (!response.writableEnded && !response.headersSent) {
            response.writeHead(400, { 'Content-Type': 'text/html' });
            response.end('<h1>Error: Missing username or password</h1>');
          }
          return;
        }

        // Parse auth parameters
        const authParameters = new URLSearchParams(authParametersString || '');
        const clientId = authParameters.get('client_id');
        const redirectUri = authParameters.get('redirect_uri');
        const codeChallenge = authParameters.get('code_challenge');
        const codeChallengeMethod = authParameters.get('code_challenge_method');
        const state = authParameters.get('state');

        if (!clientId || !redirectUri) {
          if (!response.writableEnded && !response.headersSent) {
            response.writeHead(400, { 'Content-Type': 'text/html' });
            response.end('<h1>Error: Invalid auth parameters</h1>');
          }
          return;
        }

        // Generate authorization code
        const code = randomBytes(16).toString('hex');
        const authCode: AuthorizationCode = {
          code,
          codeChallenge: codeChallenge ?? undefined,
          codeChallengeMethod: codeChallengeMethod ?? undefined,
          redirectUri,
          timestamp: Date.now(),
        };

        this.authorizationCodes.set(code, authCode);

        // Redirect to application with authorization code
        const redirectUrl = new URL(redirectUri);
        redirectUrl.searchParams.set('code', code);
        if (state) {
          redirectUrl.searchParams.set('state', state);
        }

        if (!response.writableEnded && !response.headersSent) {
          response.writeHead(302, { Location: redirectUrl.toString() });
          response.end();
        }
      } catch {
        if (!response.writableEnded && !response.headersSent) {
          response.writeHead(500, { 'Content-Type': 'text/html' });
          response.end('<h1>Error: Internal server error</h1>');
        }
      }
    });
  }


  private async handleTokenExchange(request: IncomingMessage, response: ServerResponse) {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    request.on('end', () => {
      try {
        // Parse form-urlencoded body
        const parameters = new URLSearchParams(body);
        const clientId = parameters.get('client_id');
        const code = parameters.get('code');
        const codeVerifier = parameters.get('code_verifier');

        // Validate client_id
        if (clientId !== this.config.clientId) {
          this.sendTokenError(response, 'invalid_client', 'Invalid client_id');
          return;
        }

        // Get authorization code
        const authCode = this.authorizationCodes.get(code || '');
        if (!authCode) {
          this.sendTokenError(response, 'invalid_grant', 'Invalid or expired authorization code');
          return;
        }

        // Validate PKCE if code_challenge was provided
        if (authCode.codeChallenge && this.config.supportPKCE) {
          if (!codeVerifier) {
            this.sendTokenError(response, 'invalid_request', 'Missing code_verifier');
            return;
          }

          // Verify code_verifier
          const hash = createHash('sha256').update(codeVerifier).digest('base64url');
          if (hash !== authCode.codeChallenge) {
            this.sendTokenError(response, 'invalid_grant', 'Invalid code_verifier');
            return;
          }
        }

        // Generate access token
        const accessToken = randomBytes(32).toString('hex');
        this.accessTokens.set(accessToken, { token: accessToken, timestamp: Date.now() });

        // Delete used authorization code
        this.authorizationCodes.delete(code || '');

        const tokenResponse = {
          access_token: accessToken,
          token_type: 'bearer',
          scope: 'user:email,read:user,repo',
        };

        if (!response.writableEnded && !response.headersSent) {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(tokenResponse));
        }
      } catch {
        this.sendTokenError(response, 'server_error', 'Internal server error');
      }
    });
  }

  private async handleUserInfo(request: IncomingMessage, response: ServerResponse) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (!response.writableEnded && !response.headersSent) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      return;
    }

    const token = authHeader.substring(7);
    const tokenData = this.accessTokens.get(token);

    if (!tokenData) {
      if (!response.writableEnded && !response.headersSent) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid token' }));
      }
      return;
    }

    const userInfo = {
      login: 'testuser',
      id: 12345,
      email: 'testuser@example.com',
      name: 'Test User',
    };

    if (!response.writableEnded && !response.headersSent) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(userInfo));
    }
  }

  private sendTokenError(response: ServerResponse, error: string, description: string) {
    if (!response.writableEnded && !response.headersSent) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        error,
        error_description: description,
      }));
    }
  }
}
