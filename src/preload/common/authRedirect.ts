/* eslint-disable @typescript-eslint/strict-boolean-expressions */
// on production build, if we try to redirect to http://localhost:3012 , we will reach chrome-error://chromewebdata/ , but we can easily get back
// this happens when we are redirected by OAuth login
import { SupportedStorageServices } from '@services/types';
import { WindowNames } from '@services/windows/WindowProperties';
import { windowName } from './browserViewMetaData';
import { context, window as windowService } from './services';

const CHECK_LOADED_INTERVAL = 500;
let constantsFetched = false;
let CHROME_ERROR_PATH: string | undefined;
let GITHUB_LOGIN_REDIRECT_PATH: string | undefined;
let MAIN_WINDOW_WEBPACK_ENTRY: string | undefined;
let GITHUB_OAUTH_APP_CLIENT_SECRET: string | undefined;
let GITHUB_OAUTH_APP_CLIENT_ID: string | undefined;

async function refresh(): Promise<void> {
  // get path from src/constants/paths.ts
  if (!constantsFetched) {
    await Promise.all([
      context.get('CHROME_ERROR_PATH').then((pathName) => {
        CHROME_ERROR_PATH = pathName;
      }),
      context.get('MAIN_WINDOW_WEBPACK_ENTRY').then((pathName) => {
        MAIN_WINDOW_WEBPACK_ENTRY = pathName;
      }),
      context.get('GITHUB_LOGIN_REDIRECT_PATH').then((pathName) => {
        GITHUB_LOGIN_REDIRECT_PATH = pathName;
      }),
      context.get('GITHUB_OAUTH_APP_CLIENT_SECRET').then((pathName) => {
        GITHUB_OAUTH_APP_CLIENT_SECRET = pathName;
      }),
      context.get('GITHUB_OAUTH_APP_CLIENT_ID').then((pathName) => {
        GITHUB_OAUTH_APP_CLIENT_ID = pathName;
      }),
    ]);
    constantsFetched = true;
    await refresh();
    return;
  }
  if (window.location.href.startsWith(GITHUB_LOGIN_REDIRECT_PATH!)) {
    // currently content will be something like `/tidgi-auth/github 404 not found`, we need to write something to tell user we are handling login, this is normal.
    // center the text and make it large
    document.body.innerHTML = '<div style="text-align: center; font-size: 2rem;">Handling Github login, please wait...</div>';
    // get the code
    const code = window.location.href.split('code=')[1];
    if (code) {
      // exchange the code for an access token in github
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_OAUTH_APP_CLIENT_ID,
          client_secret: GITHUB_OAUTH_APP_CLIENT_SECRET,
          code,
        }),
      });
      // get the access token from the response
      const { access_token: token } = await (response.json() as Promise<{ access_token: string }>);
      await window.service.auth.set(`${SupportedStorageServices.github}-token`, token);
    }
    await windowService.loadURL(windowName, MAIN_WINDOW_WEBPACK_ENTRY);
  } else if (window.location.href === CHROME_ERROR_PATH) {
    await windowService.loadURL(windowName, MAIN_WINDOW_WEBPACK_ENTRY);
  } else {
    setTimeout(() => void refresh(), CHECK_LOADED_INTERVAL);
  }
}

/**
 * Setting window and add workspace window may be used to login, and will be redirect, we catch it and redirect back.
 */
if (![WindowNames.main, WindowNames.view].includes(windowName)) {
  setTimeout(() => void refresh(), CHECK_LOADED_INTERVAL);
}
