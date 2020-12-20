// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
const { contextBridge } = require('electron');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require('path');

require('./common/simple-context-menu');
require('./common/require-nodejs');
require('./common/i18n');

contextBridge.exposeInMainWorld('meta', { mode: 'about', iconPath: path.join(__dirname, '..', 'icon@5x.png') });
