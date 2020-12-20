import './common/simple-context-menu';
import './common/require-nodejs';
import './common/i18n';

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'contextBri... Remove this comment to see the full error message
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('meta', { mode: 'main' });
