require('./common/simple-context-menu');
require('./common/require-nodejs');
require('./common/i18n');
require('./common/authing-postmessage');
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('meta', { mode: 'preferences' });
