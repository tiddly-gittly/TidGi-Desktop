import './common/simple-context-menu';
import './common/require-nodejs';
import './common/i18n';

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('meta', { mode: 'edit-workspace' });
