import { contextBridge } from 'electron';

import './common/i18n';
import './common/require-nodejs';
import './common/simple-context-menu';
import './common/authing-postmessage';

contextBridge.exposeInMainWorld('meta', { mode: 'add-workspace' });
