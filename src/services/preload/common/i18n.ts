// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
import { contextBridge, ipcRenderer } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'preloadBin... Remove this comment to see the full error message
import { preloadBindings } from '../../libs/i18next-electron-fs-backend';

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
