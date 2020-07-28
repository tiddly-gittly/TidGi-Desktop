const { contextBridge } = require('electron');

require('./common/i18n');
require('./common/require-nodejs');
require('./common/simple-context-menu');

contextBridge.exposeInMainWorld('meta', { mode: 'add-workspace' });

// on production build, if we try to redirect to http://localhost:3000 , we will reach chrome-error://chromewebdata/ , but we can easily get back
// this happens when we are redirected by OAuth login
const { CHROME_ERROR_PATH, REACT_PATH } = require('../constants/paths');

const CHECK_LOADED_INTERVAL = 500;
function refresh() {
  if (window.location.href === CHROME_ERROR_PATH) {
    window.location.replace(REACT_PATH);
  } else {
    setTimeout(refresh, CHECK_LOADED_INTERVAL);
  }
}
setTimeout(refresh, CHECK_LOADED_INTERVAL);
