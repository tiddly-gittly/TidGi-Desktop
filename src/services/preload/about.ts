import { contextBridge } from 'electron';
import path from 'path';

import './common/simple-context-menu';
import './common/require-nodejs';
import './common/i18n';

contextBridge.exposeInMainWorld('meta', { mode: 'about', iconPath: path.join(__dirname, '..', 'icon@5x.png') });
