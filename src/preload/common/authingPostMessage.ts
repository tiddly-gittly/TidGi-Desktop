// on production build, if we try to redirect to http://localhost:3012 , we will reach chrome-error://chromewebdata/ , but we can easily get back
// this happens when we are redirected by OAuth login
import { WindowNames } from '@services/windows/WindowProperties';
import { windowName } from './browserViewMetaData';
import { context, window as windowService } from './services';

const CHECK_LOADED_INTERVAL = 500;
let CHROME_ERROR_PATH: string | undefined;
let LOGIN_REDIRECT_PATH: string | undefined;
let MAIN_WINDOW_WEBPACK_ENTRY: string | undefined;

async function refresh(): Promise<void> {
  if (CHROME_ERROR_PATH === undefined || MAIN_WINDOW_WEBPACK_ENTRY === undefined || LOGIN_REDIRECT_PATH === undefined) {
    await Promise.all([
      context.get('CHROME_ERROR_PATH').then((pathName) => {
        CHROME_ERROR_PATH = pathName;
      }),
      context.get('LOGIN_REDIRECT_PATH').then((pathName) => {
        LOGIN_REDIRECT_PATH = pathName;
      }),
      context.get('MAIN_WINDOW_WEBPACK_ENTRY').then((pathName) => {
        MAIN_WINDOW_WEBPACK_ENTRY = pathName;
      }),
    ]);
    setTimeout(() => void refresh(), CHECK_LOADED_INTERVAL);
    return;
  }
  if (window.location.href === CHROME_ERROR_PATH || window.location.href.startsWith(LOGIN_REDIRECT_PATH)) {
    await windowService.loadURL(windowName, MAIN_WINDOW_WEBPACK_ENTRY);
  } else {
    setTimeout(() => void refresh(), CHECK_LOADED_INTERVAL);
  }
}

interface IAuthingPostMessageEvent {
  code?: number;
  data?: {
    token?: string;
  };
  from?: string;
}

if (![WindowNames.main, WindowNames.view].includes(windowName)) {
  setTimeout(() => void refresh(), CHECK_LOADED_INTERVAL);
  // Only passing message that Authing needs to the window https://github.com/Authing/Guard/blob/db9df517c00a5eb51e406377ee4d7bb097054b68/src/views/login/SocialButtonsList.vue#L82-L89
  // https://stackoverflow.com/questions/55544936/communication-between-preload-and-client-given-context-isolation-in-electron
  window.addEventListener(
    'message',
    (event: MessageEvent<IAuthingPostMessageEvent>) => {
      if (typeof event?.data?.code === 'number' && typeof event?.data?.data?.token === 'string' && event?.data.from !== 'preload') {
        // This message will be catch by this handler again, so we add a 'from' to indicate that it is re-send by ourself
        // we re-send this, so authing in this window can catch it
        window.postMessage({ ...event.data, from: 'preload' }, '*');
      }
    },
    false,
  );
}
