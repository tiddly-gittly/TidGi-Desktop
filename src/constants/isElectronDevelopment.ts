// use `require` here, to check `typeof electron === 'string'`
import electron from 'electron';

export const isElectronDevelopment = process.env.NODE_ENV === 'development' || (typeof electron === 'string' || electron.app === undefined ? false : !electron.app.isPackaged);
