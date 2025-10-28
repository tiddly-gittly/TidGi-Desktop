import { webFrame } from 'electron';

export async function consoleLogToLogFile(workspaceName = 'error-no-workspace-name'): Promise<void> {
  await webFrame.executeJavaScript(`
    (function() {
      const workspaceName = ${JSON.stringify(workspaceName)};
      
      // Save original console methods - need to bind them to console object
      const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console),
        debug: console.debug.bind(console)
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
      
      // Create wrapper functions that will be called even with Function.apply.call
      const createWrapper = (level, originalFn) => {
        return function(...args) {
          // Call original function
          originalFn(...args);
          // Send to backend
          sendToBackend(level, args);
        };
      };
      
      // Override console methods with wrappers
      console.log = createWrapper('info', originalConsole.log);
      console.warn = createWrapper('warn', originalConsole.warn);
      console.error = createWrapper('error', originalConsole.error);
      console.info = createWrapper('info', originalConsole.info);
      console.debug = createWrapper('debug', originalConsole.debug);
      
      // Important: Preserve the Function.apply.call behavior that TiddlyWiki uses
      // This ensures our wrapper is called even when using Function.apply.call(console.log, ...)
      ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
        const wrapper = console[method];
        // Make sure the wrapper has the same properties as native console methods
        Object.defineProperty(wrapper, 'name', { value: method, configurable: true });
        Object.defineProperty(wrapper, 'length', { value: 0, configurable: true });
      });
      
      originalConsole.log('[CONSOLE_HOOK] Console logging to backend file enabled for workspace:', workspaceName);
    })();
  `);
}
