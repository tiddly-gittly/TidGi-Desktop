/**
 * Should be imported after `import './common/remote';` because window.remote is used.
 */
import { WindowNames } from '@services/windows/WindowProperties';
import { webFrame } from 'electron';

export async function fixAlertConfirm(): Promise<void> {
  await webFrame.executeJavaScript(`
    window.alert = (message) => {
      // this can be async
      void window.service.native.showElectronMessageBox({ message, type: 'warning' }, '${WindowNames.main}');
    };
    
    window.confirm = (message) => {
      // this has to be sync to return selected button index to caller in 3rd party library (tiddlywiki) code
      // native window.confirm returns boolean
      return Boolean(window.remote.showElectronMessageBoxSync({ message, type: 'question', buttons: [$tw.language.getString('No'), $tw.language.getString('Yes')], defaultId: 1 }));
    };
    
    // Hook TiddlyWiki Logger.prototype.alert to capture alert calls as well
    if (typeof $tw !== 'undefined' && $tw.utils && $tw.utils.Logger) {
      const OriginalLogger = $tw.utils.Logger;
      const originalAlertMethod = OriginalLogger.prototype.alert;
      
      OriginalLogger.prototype.alert = function(...args) {
        const result = originalAlertMethod.apply(this, args);
        // Log alert calls to console so they get captured by console hook
        console.warn('[TiddlyWiki Alert]', ...args);
        return result;
      };
    }
`);
}
