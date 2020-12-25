import { contextBridge } from 'electron';

import './common/i18n';
import './common/require-nodejs';
import './common/simple-context-menu';
import './common/authing-postmessage';

const windowName = process.argv[0];

// DEBUG: console
console.log(`windowName`, windowName);

contextBridge.exposeInMainWorld('meta', { windowName });
