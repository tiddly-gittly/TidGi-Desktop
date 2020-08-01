const { contextBridge } = require('electron');
const path = require('path');

require('./common/simple-context-menu');
require('./common/require-nodejs');
require('./common/i18n');

contextBridge.exposeInMainWorld('meta', { mode: 'about', iconPath: path.join(__dirname, '..', 'icon@5x.png') });
