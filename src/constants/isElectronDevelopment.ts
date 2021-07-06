/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable unicorn/prefer-module */
const electron = require('electron');
const { isPackaged } = require('electron-is-packaged');

export const isElectronDevelopment =
  !isPackaged && (process.env.NODE_ENV === 'development' || (typeof electron === 'string' || electron.app === undefined ? false : !electron.app.isPackaged));
