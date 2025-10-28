import { webFrame } from 'electron';

export async function consoleLogToLogFile(workspaceName = 'error-no-workspace-name'): Promise<void> {
  await webFrame.executeJavaScript(`
    (function() {
      const workspaceName = ${JSON.stringify(workspaceName)};
      
      // Save original console methods
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
      };
      
      // Helper to send logs to backend using logFor
      const sendToBackend = (level, args) => {
        try {
          const message = args.map(arg => {
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          }).join(' ');
          
          void window.service.native.logFor(workspaceName, level, message);
        } catch (error) {
          originalConsole.error('Failed to send log to backend:', error);
        }
      };
      
      // Override console methods
      console.log = function(...args) {
        originalConsole.log.apply(console, args);
        sendToBackend('info', args);
      };
      
      console.warn = function(...args) {
        originalConsole.warn.apply(console, args);
        sendToBackend('warn', args);
      };
      
      console.error = function(...args) {
        originalConsole.error.apply(console, args);
        sendToBackend('error', args);
      };
      
      console.info = function(...args) {
        originalConsole.info.apply(console, args);
        sendToBackend('info', args);
      };
      
      console.debug = function(...args) {
        originalConsole.debug.apply(console, args);
        sendToBackend('debug', args);
      };
      
      originalConsole.log('[CONSOLE_HOOK] Console logging to backend file enabled for workspace:', workspaceName);
    })();
  `);
}
