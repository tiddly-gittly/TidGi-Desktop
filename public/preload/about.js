const path = require('path');

window.mode = 'about';

window.iconPath = path.join(__dirname, '..', 'icon@5x.png');

const { remote } = require('electron');
const contextMenu = require('electron-context-menu');

contextMenu({
  window: remote.getCurrentWindow(),
});
