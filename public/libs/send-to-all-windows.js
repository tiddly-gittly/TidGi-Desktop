const { BrowserWindow } = require('electron');

const sendToAllWindows = (...args) => {
  const wins = BrowserWindow.getAllWindows();
  wins.forEach((win) => {
    win.send(...args);
  });
};

module.exports = sendToAllWindows;
