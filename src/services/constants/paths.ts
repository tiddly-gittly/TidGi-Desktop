// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'isDev'.
const isDev = require('electron-is-dev');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');
const os = require('os');

const isMac = process.platform === 'darwin';

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'REACT_PATH... Remove this comment to see the full error message
const REACT_PATH = isDev ? 'http://localhost:3000' : `file://${path.resolve(__dirname, '..', '..', 'build', 'index.html')}`;
// .app/Contents/Resources/wiki/
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'TIDDLYWIKI... Remove this comment to see the full error message
const TIDDLYWIKI_TEMPLATE_FOLDER_PATH = isDev ? path.resolve(__dirname, '..', '..', 'template', 'wiki') : path.resolve(process.resourcesPath, '..', 'wiki');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'TIDDLERS_P... Remove this comment to see the full error message
const TIDDLERS_PATH = 'tiddlers';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'ICON_PATH'... Remove this comment to see the full error message
const ICON_PATH = isDev ? path.resolve(__dirname, '..', 'icon.png') : `file://${path.resolve(__dirname, '..', 'icon.png')}`;
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'CHROME_ERR... Remove this comment to see the full error message
const CHROME_ERROR_PATH = 'chrome-error://chromewebdata/';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'DESKTOP_PA... Remove this comment to see the full error message
const DESKTOP_PATH = path.join(os.homedir(), 'Desktop');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'LOG_FOLDER... Remove this comment to see the full error message
const LOG_FOLDER = isDev
  ? path.resolve(__dirname, '..', '..', 'logs')
  : isMac
  ? path.resolve(process.resourcesPath, '..', 'logs')
  : path.resolve(os.homedir(), '.tg-note', 'logs');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'LOCALIZATI... Remove this comment to see the full error message
const LOCALIZATION_FOLDER = isDev ? path.resolve(__dirname, '..', '..', 'localization') : path.resolve(process.resourcesPath, '..', 'localization');

module.exports = {
  REACT_PATH,
  TIDDLYWIKI_TEMPLATE_FOLDER_PATH,
  TIDDLERS_PATH,
  ICON_PATH,
  CHROME_ERROR_PATH,
  DESKTOP_PATH,
  LOG_FOLDER,
  LOCALIZATION_FOLDER,
  isDev,
};
