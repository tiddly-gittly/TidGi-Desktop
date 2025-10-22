/**
 * Generate OAuth login page HTML
 * Simulates GitHub's OAuth login flow with a modern UI
 */
export function generateOAuthLoginPage(
  clientId: string,
  redirectUri: string,
  codeChallenge?: string | null,
  codeChallengeMethod?: string | null,
  state?: string | null,
): string {
  // Store auth params in URL-encoded format for the form submission
  const authParameters = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    ...(codeChallenge && { code_challenge: codeChallenge }),
    ...(codeChallengeMethod && { code_challenge_method: codeChallengeMethod }),
    ...(state && { state }),
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to Mock OAuth Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background-color: #0d1117;
      color: #c9d1d9;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      width: 100%;
      max-width: 340px;
      background-color: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 32px;
    }
    .logo {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo svg {
      width: 48px;
      height: 48px;
      fill: #c9d1d9;
    }
    h1 {
      font-size: 24px;
      font-weight: 300;
      text-align: center;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    .subtitle {
      text-align: center;
      color: #8b949e;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    input {
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      background-color: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      outline: none;
    }
    input:focus {
      border-color: #58a6ff;
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.3);
    }
    button {
      width: 100%;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      background-color: #238636;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      margin-top: 8px;
    }
    button:hover {
      background-color: #2ea043;
    }
    button:active {
      background-color: #238636;
    }
    .info {
      margin-top: 24px;
      padding: 16px;
      background-color: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-size: 12px;
      color: #8b949e;
    }
    .info strong {
      color: #c9d1d9;
    }
    .app-name {
      color: #58a6ff;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
    </div>
    <h1>Sign in to TidGi</h1>
    <p class="subtitle">Mock OAuth Server for Testing</p>
    
    <form id="loginForm" method="POST" action="/oauth/login">
      <input type="hidden" name="auth_params" value="${authParameters.toString()}">
      
      <div class="form-group">
        <label for="username">Username or email address</label>
        <input 
          type="text" 
          id="username" 
          name="username" 
          required
          data-testid="oauth-username-input"
          autocomplete="username"
        >
      </div>
      
      <div class="form-group">
        <label for="password">Password</label>
        <input 
          type="password" 
          id="password" 
          name="password" 
          required
          data-testid="oauth-password-input"
          autocomplete="current-password"
        >
      </div>
      
      <button type="submit" data-testid="oauth-sign-in-button">Sign in</button>
    </form>
    
    <div class="info">
      <p><strong>Test Credentials:</strong></p>
      <p>Username: <strong>testuser</strong></p>
      <p>Password: <strong>testpass</strong></p>
      <p style="margin-top: 8px;">This is a mock OAuth server for E2E testing. Any credentials will be accepted in test mode.</p>
    </div>
  </div>
</body>
</html>`;
}
