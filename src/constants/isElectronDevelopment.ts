/* eslint-disable unicorn/prefer-module */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const electron = require('electron');

export const isElectronDevelopment = process.env.NODE_ENV === 'development' || (typeof electron === 'string' ? false : !electron.app.isPackaged);
