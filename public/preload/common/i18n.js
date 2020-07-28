const { contextBridge, ipcRenderer } = require('electron');
const electronFsBackend = require('i18next-electron-fs-backend');

contextBridge.exposeInMainWorld('api', {
  i18nextElectronBackend: electronFsBackend.preloadBindings(ipcRenderer),
});
