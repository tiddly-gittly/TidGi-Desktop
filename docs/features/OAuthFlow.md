# Git Service OAuth Flow

## Security: PKCE Implementation

All OAuth flows use **PKCE (Proof Key for Code Exchange)** instead of `client_secret`:

- ✅ **No secrets in client code** - safer for desktop apps
- ✅ **Prevents authorization code interception attacks**
- ✅ **Recommended by OAuth 2.0 RFC for public clients**

### How PKCE works

1. Generate random `code_verifier` (stored in sessionStorage)
2. Compute `code_challenge = SHA256(code_verifier)`
3. Send `code_challenge` to OAuth server
4. OAuth server returns `code`
5. Exchange `code` + `code_verifier` for token (no `client_secret` needed)

## Codeberg Setup

To enable one-click login to Codeberg:

1. Go to <https://codeberg.org/user/settings/applications>
2. Create new OAuth2 Application:
   - **Application Name**: TidGi Desktop
   - **Redirect URI**: `http://127.0.0.1:3012/tidgi-auth/codeberg`
   - **⚠️ Do NOT check "Confidential client"** (this allows PKCE)
3. Copy only the `Client ID`
4. Update `src/constants/oauthConfig.ts`:

**Note**: You don't need the `Client Secret` - PKCE is used instead for security.

## Configuration

`src/constants/oauthConfig.ts`

```typescript
export const OAUTH_CONFIGS: Record<Service, IOAuthConfig> = {
  github: {
    authorizePath: 'https://github.com/login/oauth/authorize',
    tokenPath: 'https://github.com/login/oauth/access_token',
    userInfoPath: 'https://api.github.com/user',
    clientId: '...',
    clientSecret: '...',
    redirectPath: 'http://127.0.0.1:3012/tidgi-auth/github',
    scopes: 'user:email,read:user,repo,workflow',
  },
  // Gitea/Codeberg use same API structure
  gitea: {
    authorizePath: '', // User configures: https://gitea.example.com/login/oauth/authorize
    // ...
  },
};
```

## Implementation

### Window setup

`src/services/windows/handleCreateBasicWindow.ts`

```typescript
window.webContents.on('will-redirect', (event, url) => {
  const match = isOAuthRedirect(url); // Check all services
  if (match) {
    event.preventDefault();
    const code = new URL(url).searchParams.get('code');
    // Exchange code for token using match.config.tokenPath
    // Store token -> triggers userInfo$ update
  }
});
```

### Login

`src/components/TokenForm/gitTokenHooks.ts`

```typescript
const oauthUrl = buildOAuthUrl(storageService);
if (oauthUrl) {
  location.href = oauthUrl;
}
```

## Flow

1. User clicks login → OAuth page (GitHub/Gitea/Codeberg)
2. OAuth redirects → `http://127.0.0.1:3012/tidgi-auth/{service}?code=xxx`
3. `will-redirect` event → extract code
4. Exchange code for token via `config.tokenPath`
5. Store token → `userInfo$` emits
6. Form updates ✓
