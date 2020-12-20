// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
import { contextBridge } from 'electron';

import './common/i18n';
import './common/require-nodejs';
import './common/simple-context-menu';
import './common/authing-postmessage';

contextBridge.exposeInMainWorld('meta', { mode: 'add-workspace' });
