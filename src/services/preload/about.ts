// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
import { contextBridge } from 'electron';
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
import path from 'path';

import './common/simple-context-menu';
import './common/require-nodejs';
import './common/i18n';

contextBridge.exposeInMainWorld('meta', { mode: 'about', iconPath: path.join(__dirname, '..', 'icon@5x.png') });
