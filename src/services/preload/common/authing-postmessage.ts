// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'remote'.
const { remote } = require('electron');

// on production build, if we try to redirect to http://localhost:3000 , we will reach chrome-error://chromewebdata/ , but we can easily get back
// this happens when we are redirected by OAuth login
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'CHROME_ERR... Remove this comment to see the full error message
const { CHROME_ERROR_PATH, REACT_PATH } = require('../../constants/paths');

const CHECK_LOADED_INTERVAL = 500;
function refresh() {
  if (window.location.href === CHROME_ERROR_PATH) {
    remote.getCurrentWindow().loadURL(REACT_PATH);
  } else {
    setTimeout(refresh, CHECK_LOADED_INTERVAL);
  }
}
setTimeout(refresh, CHECK_LOADED_INTERVAL);

// Only passing message that Authing needs to the window https://github.com/Authing/Guard/blob/db9df517c00a5eb51e406377ee4d7bb097054b68/src/views/login/SocialButtonsList.vue#L82-L89
// https://stackoverflow.com/questions/55544936/communication-between-preload-and-client-given-context-isolation-in-electron
window.addEventListener(
  'message',
  (event) => {
    if (typeof event?.data?.code === 'number' && event?.data?.data?.token && event?.data.from !== 'preload') {
      // This message will be catch by this handler again, so we add a 'from' to indicate that it is re-send by ourself
      // we re-send this, so authing in this window can catch it
      window.postMessage({ ...event.data, from: 'preload' }, '*');
    }
  },
  false,
);
