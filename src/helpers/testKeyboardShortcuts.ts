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
  void window.service.native.log('debug', 'Renderer(Test): initTestKeyboardShortcutFallback called', {
    isTestEnvironment,
    nodeEnv: process.env.NODE_ENV,
  });
  if (!isTestEnvironment) return () => {};

  let allShortcuts: Record<string, string> = {};
  let platform = 'win32';

  // Load platform and all current shortcut mappings
  void (async () => {
    platform = await window.service.context.get('platform').catch(() => platform);
    void window.service.native.log('debug', 'Renderer(Test): Platform detected', { platform });
    allShortcuts = await window.service.native.getKeyboardShortcuts().catch(() => ({}));
    void window.service.native.log('debug', 'Renderer(Test): Loaded all keyboard shortcuts', {
      shortcuts: allShortcuts,
      shortcutCount: Object.keys(allShortcuts).length,
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
    // On macOS, Cmd (metaKey) and Ctrl are distinct and both may be used.
    // On other platforms, only Ctrl is used as the primary modifier here.
    if (isMac) {
      if (event.ctrlKey) combo.push('Ctrl');
      if (event.metaKey) combo.push('Cmd');
    } else {
      if (event.ctrlKey) combo.push('Ctrl');
    }
    if (event.altKey) combo.push('Alt');
    if (event.shiftKey) combo.push('Shift');
    combo.push(event.key);
    return combo.join('+');
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    const pressed = formatComboFromEvent(event);
    void window.service.native.log('debug', 'Renderer(Test): Key pressed', {
      pressed,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      key: event.key,
      availableShortcuts: Object.keys(allShortcuts).length,
    });

    // Find matching shortcut key for the pressed combination
    let matched = false;
    for (const [key, shortcut] of Object.entries(allShortcuts)) {
      if (shortcut && pressed === shortcut) {
        event.preventDefault();
        matched = true;
        void window.service.native.log('debug', 'Renderer(Test): Shortcut matched', {
          pressed,
          key,
          shortcut,
        });
        void window.service.native.executeShortcutCallback(key);
        break; // Only execute the first match
      }
    }

    if (!matched) {
      void window.service.native.log('debug', 'Renderer(Test): No shortcut matched', {
        pressed,
        allShortcuts,
      });
    }
  };

  void window.service.native.log('debug', 'Renderer(Test): Adding keydown listener to document');
  document.addEventListener('keydown', handleKeyDown);
  return () => {
    void window.service.native.log('debug', 'Renderer(Test): Cleanup - removing keydown listener');
    document.removeEventListener('keydown', handleKeyDown);
    subscription?.unsubscribe?.();
  };
}
