import { remote } from 'electron';

// on production build, if we try to redirect to http://localhost:3000 , we will reach chrome-error://chromewebdata/ , but we can easily get back
// this happens when we are redirected by OAuth login
import { context } from './services';

const CHECK_LOADED_INTERVAL = 500;
let CHROME_ERROR_PATH: string | undefined;

let REACT_PATH: string | undefined;

async function refresh(): Promise<void> {
  if (CHROME_ERROR_PATH === undefined || REACT_PATH === undefined) {
    Promise.all([
      context.get('CHROME_ERROR_PATH').then((pathName) => {
        CHROME_ERROR_PATH = pathName as string;
      }),
      context.get('REACT_PATH').then((pathName) => {
        REACT_PATH = pathName as string;
      }),
    ]);
    return;
  }
  if (window.location.href === CHROME_ERROR_PATH) {
    void remote.getCurrentWindow().loadURL(REACT_PATH);
  } else {
    setTimeout(() => void refresh(), CHECK_LOADED_INTERVAL);
  }
}
setTimeout(() => void refresh(), CHECK_LOADED_INTERVAL);

interface IAuthingPostMessageEvent {
  code?: number;
  from?: string;
  data?: {
    token?: string;
  };
}
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
