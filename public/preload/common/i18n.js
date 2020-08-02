const { contextBridge, ipcRenderer } = require('electron');
const i18nextBackend = require('i18next-electron-fs-backend');

contextBridge.exposeInMainWorld('api', {
  i18nextElectronBackend: i18nextBackend.preloadBindings(ipcRenderer),
});
