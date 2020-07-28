require('./common/simple-context-menu');
require('./common/require-nodejs');
require('./common/i18n');
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('meta', { mode: 'edit-workspace' });
