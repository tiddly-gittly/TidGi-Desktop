import { contextBridge, remote, ipcRenderer, webFrame, desktopCapturer } from 'electron';
import { Channels } from '@/constants/channels';

// contextBridge.exposeInMainWorld('remote', {
//   closeCurrentWindow: () => {},

//   isFullScreen: () => remote.getCurrentWindow().isFullScreen(),
//   ipcRenderer: {
//     on: (channel: Channels, callback: (event: Electron.IpcRendererEvent, ...arguments_: unknown[]) => void) =>
//       ipcRenderer.on(channel, (event, ...arguments_) => callback(event, ...arguments_)),
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-return
//     invoke: async (channel: Channels, ...arguments_: unknown[]): Promise<unknown> => await ipcRenderer.invoke(channel, ...arguments_),
//     once: (channel: Channels, listener: (event: Electron.IpcRendererEvent, ...arguments_: unknown[]) => void): void => {
//       ipcRenderer.once(channel, listener);
//     },
//   },
//   getPlatform: () => remote.process.platform,
//   getAppVersion: () => remote.app.getVersion(),
//   getAppName: () => remote.app.name,
//   getOSVersion: () => remote.require('os').release(),
//   getEnvironmentVersions: () => process.versions,
//   getGlobal: (key: any) => remote.getGlobal(key),
//   useCurrentWindow: (callback: any) => callback(remote.getCurrentWindow()),
//   getCurrentWindowID: () => remote.getCurrentWindow().id,
//   desktopCapturer: {
//     getSources: async (options: any) => await desktopCapturer.getSources(options),
//   },
//   dialog: {
//     showOpenDialog: async (options: any) => await remote.dialog.showOpenDialog(remote.getCurrentWindow(), options),
//   },
//   regedit: {
//     list: (paths: any, callback: any) => remote.require('regedit').list(paths, callback),
//   },
//   isDefaultProtocolClient: (protocol: any) => remote.app.isDefaultProtocolClient(protocol),
//   setAsDefaultProtocolClient: (protocol: any) => remote.app.setAsDefaultProtocolClient(protocol),
//   toggleMaximize: () => {
//     const window = remote.getCurrentWindow();
//     if (window.isMaximized()) {
//       window.unmaximize();
//     } else {
//       window.maximize();
//     }
//   },
//   menu: {
//     buildFromTemplateAndPopup: (template: any) => {
//       const menu = remote.Menu.buildFromTemplate(template);
//       menu.popup(remote.getCurrentWindow());
//     },
//   },
//   clearStorageData: () => {
//     remote.session.defaultSession.clearStorageData();
//   },
// });
// declare global {
//   interface Window {
//     // remote: {
//     //   isFullScreen: () => boolean;
//     //   getPlatform: () => NodeJS.Platform;
//     //   getAppVersion: () => string;
//     //   getAppName: () => string;
//     //   getOSVersion: () => any;
//     //   getEnvironmentVersions: () => NodeJS.ProcessVersions;
//     //   getGlobal: (key: any) => any;
//     //   useCurrentWindow: (callback: any) => any;
//     //   getCurrentWindowID: () => number;
//     //   desktopCapturer: {
//     //     getSources: (options: any) => Promise<Electron.DesktopCapturerSource[]>;
//     //   };
//     //   dialog: {
//     //     showOpenDialog: (options: any) => Promise<Electron.OpenDialogReturnValue>;
//     //     showMessageBox: (options: any) => Promise<Electron.MessageBoxReturnValue>;
//     //   };
//     //   regedit: {
//     //     list: (paths: any, callback: any) => any;
//     //   };
//     //   isDefaultProtocolClient: (protocol: any) => boolean;
//     //   setAsDefaultProtocolClient: (protocol: any) => boolean;
//     //   toggleMaximize: () => void;
//     //   menu: {
//     //     buildFromTemplateAndPopup: (template: any) => void;
//     //   };
//     //   clearStorageData: () => void;
//     // };
//     electron: {
//       webFrame: {
//         setVisualZoomLevelLimits: (minimumLevel: number, maximumLevel: number) => void;
      };
    };
    ipcRenderer: {
      on: (channel: Channels, callback: (event: Electron.IpcRendererEvent, ...arguments_: unknown[]) => void) => Electron.IpcRenderer;
      invoke: (channel: Channels, ...arguments_: unknown[]) => Promise<unknown>;
      once: (channel: Channels, listener: (event: Electron.IpcRendererEvent, ...arguments_: unknown[]) => void) => void;
    };
  }
}
