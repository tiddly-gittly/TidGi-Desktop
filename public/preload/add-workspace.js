const { contextBridge } = require('electron');

require('./common/i18n');
require('./common/require-nodejs');
require('./common/simple-context-menu');
require('./common/authing-postmessage');

contextBridge.exposeInMainWorld('meta', { mode: 'add-workspace' });
