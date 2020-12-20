// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
const { contextBridge, remote, ipcRenderer, webFrame, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('remote', {
  webFrame: {
    setVisualZoomLevelLimits: (minimumLevel: any, maximumLevel: any) => webFrame.setVisualZoomLevelLimits(minimumLevel, maximumLevel),
  },
  isFullScreen: () => remote.getCurrentWindow().isFullScreen(),
  ipcRenderer: {
    on: (channel: any, callback: any) => ipcRenderer.on(channel, (event, ...arguments_) => callback(event, ...arguments_)),
    // @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'arguments_' implicitly has an 'any... Remove this comment to see the full error message
    invoke: (channel: any, ...arguments_) => ipcRenderer.invoke(channel, ...arguments_),
    // @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'arguments_' implicitly has an 'any... Remove this comment to see the full error message
    send: (channel: any, ...arguments_) => ipcRenderer.send(channel, ...arguments_),
    // @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'arguments_' implicitly has an 'any... Remove this comment to see the full error message
    sendSync: (channel: any, ...arguments_) => ipcRenderer.sendSync(channel, ...arguments_),
    // @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'arguments_' implicitly has an 'any... Remove this comment to see the full error message
    removeListener: (channel: any, ...arguments_) => ipcRenderer.removeListener(channel, ...arguments_),
    // @ts-expect-error ts-migrate(7019) FIXME: Rest parameter 'arguments_' implicitly has an 'any... Remove this comment to see the full error message
    once: (channel: any, ...arguments_) => ipcRenderer.once(channel, ...arguments_),
  },
  getPlatform: () => remote.process.platform,
  getAppVersion: () => remote.app.getVersion(),
  getAppName: () => remote.app.name,
  getOSVersion: () => remote.require('os').release(),
  getEnvironmentVersions: () => process.versions,
  getGlobal: (key: any) => remote.getGlobal(key),
  closeCurrentWindow: () => remote.getCurrentWindow().close(),
  useCurrentWindow: (callback: any) => callback(remote.getCurrentWindow()),
  getCurrentWindowID: () => remote.getCurrentWindow().id,
  desktopCapturer: {
    getSources: (options: any) => desktopCapturer.getSources(options),
  },
  dialog: {
    showOpenDialog: (options: any) => remote.dialog.showOpenDialog(remote.getCurrentWindow(), options),
    showMessageBox: (options: any) => remote.dialog.showMessageBox(remote.getCurrentWindow(), options),
  },
  regedit: {
    list: (paths: any, callback: any) => remote.require('regedit').list(paths, callback),
  },
  isDefaultProtocolClient: (protocol: any) => remote.app.isDefaultProtocolClient(protocol),
  setAsDefaultProtocolClient: (protocol: any) => remote.app.setAsDefaultProtocolClient(protocol),
  toggleMaximize: () => {
    const window = remote.getCurrentWindow();
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  },
  menu: {
    buildFromTemplateAndPopup: (template: any) => {
      const menu = remote.Menu.buildFromTemplate(template);
      // @ts-expect-error ts-migrate(2559) FIXME: Type 'BrowserWindow' has no properties in common w... Remove this comment to see the full error message
      menu.popup(remote.getCurrentWindow());
    },
  },
  clearStorageData: () => {
    remote.session.defaultSession.clearStorageData();
  },
});
