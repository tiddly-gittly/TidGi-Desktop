import { contextBridge, ipcRenderer } from 'electron';
import { preloadBindings } from '../../libs/i18n/i18next-electron-fs-backend';

contextBridge.exposeInMainWorld('i18n', {
  i18nextElectronBackend: preloadBindings(ipcRenderer),
});

window.addEventListener(
  'message',
  (event) => {
    console.log(event);
  },
  false,
);
