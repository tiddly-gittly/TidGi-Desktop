/**
 * Test-only keyboard shortcut fallback for E2E testing environments.
 *
 * TECHNICAL LIMITATION EXPLANATION:
 * E2E testing frameworks (like Playwright, Puppeteer, or Selenium) cannot simulate
 * system-level global keyboard shortcuts because:
 * 1. Operating systems restrict access to global hotkeys for security reasons
 * 2. Browser sandboxing prevents web content from intercepting OS-level key events
 * 3. Test automation tools operate within browser context, not at OS level
 * 4. Global shortcuts are typically handled by native applications outside browser scope
 *
 * WORKAROUND SOLUTION:
 * This fallback listens to document-level keydown events in the renderer process
 * and manually routes matching key combinations to their corresponding service methods.
 * This approach only works during testing when the application window has focus,
 * but allows E2E tests to verify keyboard shortcut functionality without requiring
 * actual OS-level global hotkey simulation.
 *
 * GENERIC DESIGN:
 * Unlike hardcoding specific shortcuts, this system dynamically handles ALL registered
 * keyboard shortcuts by parsing the "ServiceName.methodName" format and calling the
 * appropriate service method through the window.service API.
 *
 * In production, global shortcuts are properly handled by the main process via
 * NativeService.registerKeyboardShortcut using Electron's globalShortcut API.
 */

export function initTestKeyboardShortcutFallback(): () => void {
  const isTestEnvironment = process.env.NODE_ENV === 'test';
  if (!isTestEnvironment) return () => {};

  let allShortcuts: Record<string, string> = {};
  let platform = 'win32';

  // Load platform and all current shortcut mappings
  void (async () => {
    platform = await window.service.context.get('platform').catch(() => platform);
    allShortcuts = await window.service.native.getKeyboardShortcuts().catch(() => ({}));
    void window.service.native.log('debug', 'Renderer(Test): Loaded all keyboard shortcuts', {
      shortcuts: allShortcuts,
    });
  })();

  // Subscribe to preference changes to keep all shortcuts up to date
  const subscription = window.observables.preference?.preference$?.subscribe?.((pref: unknown) => {
    const p = pref as { keyboardShortcuts?: Record<string, string> } | undefined;
    if (p?.keyboardShortcuts) {
      allShortcuts = { ...p.keyboardShortcuts };
      void window.service.native.log('debug', 'Renderer(Test): Updated shortcuts from preferences', {
        shortcuts: allShortcuts,
      });
    }
  });

  const formatComboFromEvent = (event: KeyboardEvent): string => {
    const combo: string[] = [];
    const isMac = platform === 'darwin';
    if (event.ctrlKey || event.metaKey) combo.push(isMac ? 'Cmd' : 'Ctrl');
    if (event.altKey) combo.push('Alt');
    if (event.shiftKey) combo.push('Shift');
    combo.push(event.key);
    return combo.join('+');
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    const pressed = formatComboFromEvent(event);

    // Find matching shortcut key for the pressed combination
    for (const [key, shortcut] of Object.entries(allShortcuts)) {
      if (shortcut && pressed === shortcut) {
        event.preventDefault();
        void window.service.native.log('debug', 'Renderer(Test): Shortcut matched', {
          pressed,
          key,
          shortcut,
        });
        void window.service.native.executeShortcutCallback(key);
        break; // Only execute the first match
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    subscription?.unsubscribe?.();
  };
}
