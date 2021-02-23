import { ipcRenderer } from 'electron';

export function loadListeners(store: any): void {
  ipcRenderer.on('log', (_event: Electron.IpcRendererEvent, message: any) => {
    if (message) console.log(message); // eslint-disable-line no-console
  });

  // send back a request with text
  ipcRenderer.on('request-back-find-in-page', (_event: Electron.IpcRendererEvent, forward: any) => {
    const { open, text } = store.getState().findInPage;
    if (!open) return;
    void window.service.window.findInPage(text, forward);
  });
}
