/* eslint-disable unicorn/prefer-module */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const electron = require('electron');

if (typeof electron === 'string') {
  throw new TypeError('Not running in an Electron environment!');
}
export const isElectronDevelopment = typeof electron === 'string' ? false : !electron.app.isPackaged;
