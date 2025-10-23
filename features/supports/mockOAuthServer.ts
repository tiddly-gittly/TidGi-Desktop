/**
 * Mock OAuth Server using oauth2-mock-server
 *
 * Replaced custom implementation with professional OAuth 2 mock server.
 * Key benefits:
 * - Standards-compliant OAuth 2.0 + PKCE
 * - Automatic JWT token generation
 * - Proper error handling
 * - Less code to maintain (from 400+ lines to ~100 lines)
 *
 * Note: oauth2-mock-server automatically handles authorization.
 * It doesn't provide a login UI - it immediately redirects with a code.
 * This is perfect for testing token exchange logic without UI complexity.
 *
 * Standard OAuth 2 endpoints:
 * - /authorize (authorization endpoint)
 * - /token (token exchange endpoint)
 * - /userinfo (user info endpoint)
 */
import { OAuth2Server } from 'oauth2-mock-server';
import type { MutableResponse, MutableToken } from 'oauth2-mock-server';

export class MockOAuthServer {
  private server: OAuth2Server | null = null;
  public port = 0;
  public baseUrl = '';

  constructor(
    private config: { clientId: string },
    private fixedPort?: number,
  ) {}

  async start(): Promise<void> {
    this.server = new OAuth2Server();

    // Generate RSA key for signing JWT tokens
    await this.server.issuer.keys.generate('RS256');

    // Start server on specified or random port
    await this.server.start(this.fixedPort || 0, '127.0.0.1');

    const address = this.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address');
    }

    this.port = address.port;
    this.baseUrl = `http://127.0.0.1:${this.port}`;

    // Configure issuer URL
    this.server.issuer.url = this.baseUrl;

    // Setup custom behavior to match real OAuth servers
    this.setupCustomBehavior();
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }

  /**
   * Customize server behavior to match GitHub/GitLab/Gitea OAuth servers
   */
  private setupCustomBehavior(): void {
    if (!this.server) return;

    // Customize access token to include GitHub-like claims
    this.server.service.on('beforeTokenSigning', (token: MutableToken, _request) => {
      token.payload.scope = 'user:email,read:user,repo,workflow';
      token.payload.token_type = 'bearer';
    });

    // Simulate user info endpoint (matches GitHub API response)
    this.server.service.on('beforeUserinfo', (userInfoResponse: MutableResponse, _request) => {
      userInfoResponse.body = {
        login: 'testuser',
        id: 12345,
        email: 'testuser@example.com',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      };
    });
  }
}
