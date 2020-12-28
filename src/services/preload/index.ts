import { contextBridge } from 'electron';

import './common/i18n';
import './common/require-nodejs';
import './common/simple-context-menu';
import './common/authing-postmessage';
import { WindowNames } from '@/services/windows/WindowProperties';

const windowName = process.argv[0] as WindowNames;

// DEBUG: console
console.log(`windowName`, windowName);

contextBridge.exposeInMainWorld('meta', { windowName });

if (windowName === WindowNames.view) {
  void import('./view');
}
