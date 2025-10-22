import { createHash } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockOAuthServer } from './mockOAuthServer';

// Helper to generate valid PKCE pair
function generatePKCEPair(verifier: string): { codeChallenge: string; codeVerifier: string } {
  const hash = createHash('sha256').update(verifier).digest('base64url');
  return {
    codeVerifier: verifier,
    codeChallenge: hash,
  };
}

describe('Mock OAuth Server', () => {
  let server: MockOAuthServer;

  beforeAll(async () => {
    server = new MockOAuthServer({ clientId: 'test-client-id' });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    // Clear any state between tests if needed
  });

  it('should start server and return health check', async () => {
    const response = await fetch(`${server.baseUrl}/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: 'ok' });
  });

  it('should show login page on authorization request', async () => {
    const params = new URLSearchParams({
      client_id: 'test-client-id',
      redirect_uri: 'http://127.0.0.1:3012/tidgi-auth/testOAuth',
      scope: 'user:email,read:user',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
    });

    const response = await fetch(`${server.baseUrl}/oauth/authorize?${params.toString()}`);
    expect(response.status).toBe(200);
    
    const html = await response.text();
    expect(html).toContain('Sign in to TidGi');
    expect(html).toContain('data-testid="oauth-username-input"');
    expect(html).toContain('data-testid="oauth-password-input"');
    expect(html).toContain('data-testid="oauth-sign-in-button"');
  });

  it('should reject invalid client_id', async () => {
    const params = new URLSearchParams({
      client_id: 'invalid-client-id',
      redirect_uri: 'http://127.0.0.1:3012/tidgi-auth/testOAuth',
    });

    const response = await fetch(`${server.baseUrl}/oauth/authorize?${params.toString()}`);
    expect(response.status).toBe(400);
    
    const html = await response.text();
    expect(html).toContain('Invalid client_id');
  });

  it('should handle login form submission and redirect with code', async () => {
    const authParams = new URLSearchParams({
      client_id: 'test-client-id',
      redirect_uri: 'http://127.0.0.1:3012/tidgi-auth/testOAuth',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
    });

    const formData = new URLSearchParams({
      username: 'testuser',
      password: 'testpass',
      auth_params: authParams.toString(),
    });

    const response = await fetch(`${server.baseUrl}/oauth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      redirect: 'manual', // Don't follow redirect
    });

    expect(response.status).toBe(302);
    
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    expect(location).toContain('http://127.0.0.1:3012/tidgi-auth/testOAuth?code=');
    
    // Extract code from redirect URL
    const url = new URL(location!);
    const code = url.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(code?.length).toBeGreaterThan(20);
  });

  it('should exchange authorization code for access token with PKCE', async () => {
    // Generate a valid PKCE pair
    const { codeVerifier, codeChallenge } = generatePKCEPair('test-code-verifier-12345678901234567890123456');

    // Step 1: Get authorization code
    const authParams = new URLSearchParams({
      client_id: 'test-client-id',
      redirect_uri: 'http://127.0.0.1:3012/tidgi-auth/testOAuth',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const loginFormData = new URLSearchParams({
      username: 'testuser',
      password: 'testpass',
      auth_params: authParams.toString(),
    });

    const loginResponse = await fetch(`${server.baseUrl}/oauth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginFormData.toString(),
      redirect: 'manual',
    });

    const location = loginResponse.headers.get('location');
    const code = new URL(location!).searchParams.get('code');

    // Step 2: Exchange code for token with correct verifier
    const tokenRequestBody = new URLSearchParams({
      client_id: 'test-client-id',
      code: code!,
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetch(`${server.baseUrl}/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody.toString(),
    });

    expect(tokenResponse.status).toBe(200);
    
    const tokenData = await tokenResponse.json();
    expect(tokenData).toHaveProperty('access_token');
    expect(tokenData).toHaveProperty('token_type', 'bearer');
    expect(tokenData).toHaveProperty('scope');
    expect(tokenData.access_token.length).toBeGreaterThan(40);
  });

  it('should reject token exchange with invalid code_verifier', async () => {
    // Get a valid code first
    const authParams = new URLSearchParams({
      client_id: 'test-client-id',
      redirect_uri: 'http://127.0.0.1:3012/tidgi-auth/testOAuth',
      code_challenge: 'valid-challenge',
      code_challenge_method: 'S256',
    });

    const loginFormData = new URLSearchParams({
      username: 'testuser',
      password: 'testpass',
      auth_params: authParams.toString(),
    });

    const loginResponse = await fetch(`${server.baseUrl}/oauth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginFormData.toString(),
      redirect: 'manual',
    });

    const location = loginResponse.headers.get('location');
    const code = new URL(location!).searchParams.get('code');

    // Try to exchange with wrong verifier
    const tokenRequestBody = new URLSearchParams({
      client_id: 'test-client-id',
      code: code!,
      code_verifier: 'wrong-verifier',
    });

    const tokenResponse = await fetch(`${server.baseUrl}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenRequestBody.toString(),
    });

    expect(tokenResponse.status).toBe(400);
    
    const errorData = await tokenResponse.json();
    expect(errorData).toHaveProperty('error', 'invalid_grant');
    expect(errorData.error_description).toContain('Invalid code_verifier');
  });

  it('should return user info with valid access token', async () => {
    // Generate a valid PKCE pair
    const { codeVerifier, codeChallenge } = generatePKCEPair('test-code-verifier-for-user-info-test-123456789');

    // Get a valid token first
    const authParams = new URLSearchParams({
      client_id: 'test-client-id',
      redirect_uri: 'http://127.0.0.1:3012/tidgi-auth/testOAuth',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const loginFormData = new URLSearchParams({
      username: 'testuser',
      password: 'testpass',
      auth_params: authParams.toString(),
    });

    const loginResponse = await fetch(`${server.baseUrl}/oauth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginFormData.toString(),
      redirect: 'manual',
    });

    const location = loginResponse.headers.get('location');
    const code = new URL(location!).searchParams.get('code');

    const tokenRequestBody = new URLSearchParams({
      client_id: 'test-client-id',
      code: code!,
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetch(`${server.baseUrl}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenRequestBody.toString(),
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info
    const userInfoResponse = await fetch(`${server.baseUrl}/api/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(userInfoResponse.status).toBe(200);
    
    const userInfo = await userInfoResponse.json();
    expect(userInfo).toHaveProperty('login', 'testuser');
    expect(userInfo).toHaveProperty('email', 'testuser@example.com');
    expect(userInfo).toHaveProperty('id');
    expect(userInfo).toHaveProperty('name', 'Test User');
  });

  it('should reject user info request with invalid token', async () => {
    const userInfoResponse = await fetch(`${server.baseUrl}/api/user`, {
      headers: {
        Authorization: 'Bearer invalid-token',
      },
    });

    expect(userInfoResponse.status).toBe(401);
    
    const errorData = await userInfoResponse.json();
    expect(errorData).toHaveProperty('error', 'Invalid token');
  });

  it('should reject user info request without authorization header', async () => {
    const userInfoResponse = await fetch(`${server.baseUrl}/api/user`);

    expect(userInfoResponse.status).toBe(401);
    
    const errorData = await userInfoResponse.json();
    expect(errorData).toHaveProperty('error', 'Unauthorized');
  });
});
