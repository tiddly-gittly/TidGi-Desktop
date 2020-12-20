// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
const { contextBridge } = require('electron');

require('./common/i18n');
require('./common/require-nodejs');
require('./common/simple-context-menu');
require('./common/authing-postmessage');

contextBridge.exposeInMainWorld('meta', { mode: 'add-workspace' });
