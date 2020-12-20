require('./common/simple-context-menu');
require('./common/require-nodejs');
require('./common/i18n');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('meta', { mode: 'auth' });
