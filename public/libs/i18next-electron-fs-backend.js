const fs = require('fs-extra');
const path = require('path');
const sendToAllWindows = require('./send-to-all-windows');
const { LOCALIZATION_FOLDER } = require('../constants/paths');
const i18n = require('./i18n');

// Electron-specific; must match mainIpc
const readFileRequest = 'ReadFile-Request';
const writeFileRequest = 'WriteFile-Request';
const readFileResponse = 'ReadFile-Response';
const writeFileResponse = 'WriteFile-Response';
const changeLanguageRequest = 'ChangeLanguage-Request';

// This is the code that will go into the preload.js file
// in order to set up the contextBridge api
const preloadBindings = function(ipcRenderer) {
  return {
    send: (channel, data) => {
      const validChannels = [readFileRequest, writeFileRequest];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    onReceive: (channel, func) => {
      const validChannels = [readFileResponse, writeFileResponse];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes "sender"
        ipcRenderer.on(channel, (event, arguments_) => func(arguments_));
      }
    },
    onLanguageChange: func => {
      // Deliberately strip event as it includes "sender"
      ipcRenderer.on(changeLanguageRequest, (event, arguments_) => {
        func(arguments_);
      });
    },
  };
};

// This is the code that will go into the main.js file
// in order to set up the ipc main bindings
const mainBindings = function(ipcMain, browserWindow) {
  ipcMain.on(readFileRequest, (IpcMainEvent, arguments_) => {
    const localeFilePath = path.join(LOCALIZATION_FOLDER, arguments_.filename);
    fs.readFile(localeFilePath, 'utf8', (error, data) => {
      sendToAllWindows(readFileResponse, {
        key: arguments_.key,
        error,
        data: typeof data !== 'undefined' && data !== null ? data.toString() : '',
      });
    });
  });

  ipcMain.on(writeFileRequest, (IpcMainEvent, arguments_) => {
    const localeFilePath = path.join(LOCALIZATION_FOLDER, arguments_.filename);
    const localeFileFolderPath = path.dirname(localeFilePath);
    fs.ensureDir(localeFileFolderPath, directoryCreationError => {
      if (directoryCreationError) {
        console.error(directoryCreationError);
        return;
      }
      fs.writeFile(localeFilePath, JSON.stringify(arguments_.data), error => {
        sendToAllWindows(writeFileResponse, {
          keys: arguments_.keys,
          error,
        });
      });
    });
  });
};

// Clears the bindings from ipcMain;
// in case app is closed/reopened (only on macos)
const clearMainBindings = function(ipcMain) {
  ipcMain.removeAllListeners(readFileRequest);
  ipcMain.removeAllListeners(writeFileRequest);
};

const whitelistMap = JSON.parse(fs.readFileSync(path.join(LOCALIZATION_FOLDER, 'whitelist.json'), 'utf-8'));

const whiteListedLanguages = Object.keys(whitelistMap);

function getLanguageMenu() {
  const subMenu = [];
  for (const language of whiteListedLanguages) {
    subMenu.push({
      label: whitelistMap[language],
      click: (menuItem, browserWindow, event) => {
        // eslint-disable-next-line global-require
        const { onEachView } = require('./views');
        onEachView(view => {
          i18n.changeLanguage(language);
          view.webContents.send(changeLanguageRequest, {
            lng: language,
          });
          sendToAllWindows(changeLanguageRequest, {
            lng: language,
          });
        });
      },
    });
  }

  return subMenu;
}

module.exports = {
  getLanguageMenu,
  readFileRequest,
  writeFileRequest,
  readFileResponse,
  writeFileResponse,
  changeLanguageRequest,
  preloadBindings,
  mainBindings,
  clearMainBindings,
};
