const { contextBridge, remote, ipcRenderer, webFrame, desktopCapturer } = require('electron');

contextBridge.exposeInMainWorld('remote', {
  webFrame: {
    setVisualZoomLevelLimits: (minimumLevel, maximumLevel) =>
      webFrame.setVisualZoomLevelLimits(minimumLevel, maximumLevel),
  },
  isFullScreen: () => remote.getCurrentWindow().isFullScreen(),
  ipcRenderer: {
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...arguments_) => callback(event, ...arguments_)),
    invoke: (channel, ...arguments_) => ipcRenderer.invoke(channel, ...arguments_),
    send: (channel, ...arguments_) => ipcRenderer.send(channel, ...arguments_),
    sendSync: (channel, ...arguments_) => ipcRenderer.sendSync(channel, ...arguments_),
  },
  getPlatform: () => remote.process.platform,
  getAppVersion: () => remote.app.getVersion(),
  getAppName: () => remote.app.name,
  getOSVersion: () => remote.require('os').release(),
  getEnvironmentVersions: () => process.versions,
  getGlobal: key => remote.getGlobal(key),
  closeCurrentWindow: () => remote.getCurrentWindow().close(),
  useCurrentWindow: callback => callback(remote.getCurrentWindow()),
  getCurrentWindowID: () => remote.getCurrentWindow().id,
  desktopCapturer: {
    getSources: options => desktopCapturer.getSources(options),
  },
  dialog: {
    showOpenDialog: options => remote.dialog.showOpenDialog(remote.getCurrentWindow(), options),
    showMessageBox: options => remote.dialog.showMessageBox(remote.getCurrentWindow(), options),
  },
  regedit: {
    list: (paths, callback) => remote.require('regedit').list(paths, callback),
  },
  isDefaultProtocolClient: protocol => remote.app.isDefaultProtocolClient(protocol),
  setAsDefaultProtocolClient: protocol => remote.app.setAsDefaultProtocolClient(protocol),
  toggleMaximize: () => {
    const window = remote.getCurrentWindow();
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  },
  menu: {
    buildFromTemplateAndPopup: template => {
      const menu = remote.Menu.buildFromTemplate(template);
      menu.popup(remote.getCurrentWindow());
    },
  },
  clearStorageData: () => {
    remote.session.defaultSession.clearStorageData();
  },
});
