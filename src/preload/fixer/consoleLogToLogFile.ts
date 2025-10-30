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
      
      // Ensure TiddlyWiki Logger uses our hooked console methods
      // TiddlyWiki uses Function.apply.call(console.log, console, logMessage)
      // Our console hook should already capture these calls, no need to duplicate logging
      const ensureTiddlyWikiLoggerUsesHookedConsole = () => {
        if (typeof $tw !== 'undefined' && $tw.utils && $tw.utils.Logger) {
          // Verify that Logger will use our hooked console by checking if console.log is our wrapper
          const isHooked = console.log.toString().includes('sendToBackend') || console.log.name !== 'log';
          if (isHooked) {
            originalConsole.log('[CONSOLE_HOOK] TiddlyWiki Logger will use hooked console methods');
          } else {
            originalConsole.warn('[CONSOLE_HOOK] Warning: console.log might not be properly hooked for TiddlyWiki');
          }
        }
      };
      
      // Try to verify immediately if $tw is available
      ensureTiddlyWikiLoggerUsesHookedConsole();
      
      // Also watch for $tw to become available
      if (typeof $tw === 'undefined') {
        const checkInterval = setInterval(() => {
          if (typeof $tw !== 'undefined' && $tw.utils && $tw.utils.Logger) {
            ensureTiddlyWikiLoggerUsesHookedConsole();
            clearInterval(checkInterval);
          }
        }, 100);
        
        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkInterval), 10000);
      }
      
      originalConsole.log('[CONSOLE_HOOK] Console logging to backend file enabled for workspace:', workspaceName);
    })();
  `);
}
