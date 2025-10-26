import type { ElectronApplication } from 'playwright';

/**
 * Get text content from WebContentsView
 * @param app Electron application instance
 * @returns Promise<string | null> Returns text content or null
 */
export async function getTextContent(app: ElectronApplication): Promise<string | null> {
  return await app.evaluate(async ({ BrowserWindow }) => {
    // Get all browser windows
    const windows = BrowserWindow.getAllWindows();

    for (const window of windows) {
      // Get all child views (WebContentsView instances) attached to this window
      if (window.contentView && 'children' in window.contentView) {
        const views = window.contentView.children || [];

        for (const view of views) {
          // Type guard to check if view is a WebContentsView
          if (view && view.constructor.name === 'WebContentsView') {
            try {
              // Cast to WebContentsView type and execute JavaScript
              const webContentsView = view as unknown as { webContents: { executeJavaScript: (script: string) => Promise<string> } };
              const content = await webContentsView.webContents.executeJavaScript(`
                  document.body.textContent || document.body.innerText || ''
                `);
              if (content && content.trim()) {
                return content;
              }
            } catch {
              // Continue to next view if this one fails
              continue;
            }
          }
        }
      }
    }
    return null;
  });
}

/**
 * Get DOM content from WebContentsView
 * @param app Electron application instance
 * @returns Promise<string | null> Returns DOM content or null
 */
export async function getDOMContent(app: ElectronApplication): Promise<string | null> {
  return await app.evaluate(async ({ BrowserWindow }) => {
    // Get all browser windows
    const windows = BrowserWindow.getAllWindows();

    for (const window of windows) {
      // Get all child views (WebContentsView instances) attached to this window
      if (window.contentView && 'children' in window.contentView) {
        const views = window.contentView.children || [];

        for (const view of views) {
          // Type guard to check if view is a WebContentsView
          if (view && view.constructor.name === 'WebContentsView') {
            try {
              // Cast to WebContentsView type and execute JavaScript
              const webContentsView = view as unknown as { webContents: { executeJavaScript: (script: string) => Promise<string> } };
              const content = await webContentsView.webContents.executeJavaScript(`
                  document.documentElement.outerHTML || ''
                `);
              if (content && content.trim()) {
                return content;
              }
            } catch {
              // Continue to next view if this one fails
              continue;
            }
          }
        }
      }
    }
    return null;
  });
}

/**
 * Check if WebContentsView exists and is loaded
 * @param app Electron application instance
 * @returns Promise<boolean> Returns whether it exists and is loaded
 */
export async function isLoaded(app: ElectronApplication): Promise<boolean> {
  return await app.evaluate(async ({ BrowserWindow }) => {
    // Get all browser windows
    const windows = BrowserWindow.getAllWindows();

    for (const window of windows) {
      // Get all child views (WebContentsView instances) attached to this window
      if (window.contentView && 'children' in window.contentView) {
        const views = window.contentView.children || [];

        for (const view of views) {
          // Type guard to check if view is a WebContentsView
          if (view && view.constructor.name === 'WebContentsView') {
            // If we found a WebContentsView, consider it loaded
            return true;
          }
        }
      }
    }
    return false;
  });
}

/**
 * Find specified text in WebContentsView
 * @param app Electron application instance
 * @param expectedText Text to search for
 * @param contentType Content type: 'text' or 'dom'
 * @returns Promise<boolean> Returns whether text was found
 */
export async function containsText(
  app: ElectronApplication,
  expectedText: string,
  contentType: 'text' | 'dom' = 'text',
): Promise<boolean> {
  const content = contentType === 'text'
    ? await getTextContent(app)
    : await getDOMContent(app);

  return content !== null && content.includes(expectedText);
}

/**
 * Get WebContentsView content summary (for error messages)
 * @param app Electron application instance
 * @param contentType Content type: 'text' or 'dom'
 * @param maxLength Maximum length, default 200
 * @returns Promise<string> Returns content summary
 */
export async function getContentSummary(
  app: ElectronApplication,
  contentType: 'text' | 'dom' = 'text',
  maxLength: number = 200,
): Promise<string> {
  const content = contentType === 'text'
    ? await getTextContent(app)
    : await getDOMContent(app);

  if (!content) {
    return 'null';
  }

  return content.length > maxLength
    ? content.substring(0, maxLength) + '...'
    : content;
}

/**
 * Click element containing specific text in browser view
 * @param app Electron application instance
 * @param selector CSS selector for parent elements
 * @param text Text content to match
 */
export async function clickElementWithText(
  app: ElectronApplication,
  selector: string,
  text: string,
): Promise<void> {
  const result = await app.evaluate(
    async ({ BrowserWindow }, parameters: { selector: string; text: string }) => {
      const windows = BrowserWindow.getAllWindows();
      for (const window of windows) {
        if (window.contentView && 'children' in window.contentView) {
          const views = window.contentView.children || [];
          for (const view of views) {
            if (view && view.constructor.name === 'WebContentsView') {
              const webContentsView = view as unknown as {
                webContents: { executeJavaScript: (script: string, userGesture?: boolean) => Promise<unknown> };
              };
              try {
                const executeResult = await webContentsView.webContents.executeJavaScript(
                  `
                (function() {
                  const selector = ${JSON.stringify(parameters.selector)};
                  const text = ${JSON.stringify(parameters.text)};
                  const elements = document.querySelectorAll(selector);
                  let found = null;
                  for (let i = 0; i < elements.length; i++) {
                    const elem = elements[i];
                    const elemText = elem.textContent || elem.innerText || '';
                    if (elemText.trim() === text.trim() || elemText.includes(text)) {
                      found = elem;
                      break;
                    }
                  }
                  if (!found) {
                    return { success: false, error: 'Element with text "' + text + '" not found in selector: ' + selector };
                  }
                  found.click();
                  return { success: true };
                })()
              `,
                  true,
                );
                return executeResult;
              } catch (error) {
                return { success: false, error: String(error) };
              }
            }
          }
        }
      }
      return { success: false, error: 'No browser view found' };
    },
    { selector, text },
  );

  if (result && typeof result === 'object' && 'success' in result && !result.success) {
    throw new Error((result as { error?: string }).error || 'Unknown error');
  }
}

/**
 * Click element in browser view
 * @param app Electron application instance
 * @param selector CSS selector for the element
 */
export async function clickElement(app: ElectronApplication, selector: string): Promise<void> {
  const result = await app.evaluate(async ({ BrowserWindow }, selectorParameter: string) => {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (window.contentView && 'children' in window.contentView) {
        const views = window.contentView.children || [];
        for (const view of views) {
          if (view && view.constructor.name === 'WebContentsView') {
            const webContentsView = view as unknown as { webContents: { executeJavaScript: (script: string, userGesture?: boolean) => Promise<unknown> } };
            try {
              // Execute JavaScript that returns result
              const executeResult = await webContentsView.webContents.executeJavaScript(
                `
                (function() {
                  const selector = ${JSON.stringify(selectorParameter)};
                  const elem = document.querySelector(selector);
                  if (!elem) {
                    return { success: false, error: 'Element not found: ' + selector };
                  }
                  elem.click();
                  return { success: true };
                })()
              `,
                true,
              );
              return executeResult;
            } catch (error) {
              return { success: false, error: String(error) };
            }
          }
        }
      }
    }
    return { success: false, error: 'No browser view found' };
  }, selector);

  if (result && typeof result === 'object' && 'success' in result && !result.success) {
    throw new Error((result as { error?: string }).error || 'Unknown error');
  }
}

/**
 * Type text in element in browser view
 * @param app Electron application instance
 * @param selector CSS selector for the element
 * @param text Text to type
 */
export async function typeText(app: ElectronApplication, selector: string, text: string): Promise<void> {
  await app.evaluate(async ({ BrowserWindow }, parameters: { selector: string; text: string }) => {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (window.contentView && 'children' in window.contentView) {
        const views = window.contentView.children || [];
        for (const view of views) {
          if (view && view.constructor.name === 'WebContentsView') {
            const webContentsView = view as unknown as { webContents: { executeJavaScript: (script: string) => Promise<unknown> } };
            // Use string concatenation to avoid template literal issues
            const escapedSelector = parameters.selector.replace(/'/g, "\\'");
            const escapedText = parameters.text.replace(/'/g, "\\'").replace(/\n/g, '\\n');
            const script = `(function() {
              const selector = '` + escapedSelector + `';
              const text = '` + escapedText + `';
              const elem = document.querySelector(selector);
              if (!elem) {
                throw new Error('Element not found: ' + selector);
              }
              elem.focus();
              if (elem.tagName === 'TEXTAREA' || elem.tagName === 'INPUT') {
                elem.value = text;
              } else {
                elem.textContent = text;
              }
              elem.dispatchEvent(new Event('input', { bubbles: true }));
              elem.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            })()`;
            await webContentsView.webContents.executeJavaScript(script);
            return;
          }
        }
      }
    }
    throw new Error('No browser view found');
  }, { selector, text });
}

/**
 * Press key in browser view
 * @param app Electron application instance
 * @param key Key to press
 */
export async function pressKey(app: ElectronApplication, key: string): Promise<void> {
  await app.evaluate(async ({ BrowserWindow }, keyParameter: string) => {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (window.contentView && 'children' in window.contentView) {
        const views = window.contentView.children || [];
        for (const view of views) {
          if (view && view.constructor.name === 'WebContentsView') {
            const webContentsView = view as unknown as { webContents: { executeJavaScript: (script: string) => Promise<unknown> } };
            // Use string concatenation to avoid template literal issues
            const escapedKey = keyParameter.replace(/'/g, "\\'");
            const script = `(function() {
              const key = '` + escapedKey + `';
              const event = new KeyboardEvent('keydown', {
                key: key,
                code: key,
                bubbles: true,
                cancelable: true
              });
              document.activeElement?.dispatchEvent(event);
              
              const keyupEvent = new KeyboardEvent('keyup', {
                key: key,
                code: key,
                bubbles: true,
                cancelable: true
              });
              document.activeElement?.dispatchEvent(keyupEvent);
              return true;
            })()`;
            await webContentsView.webContents.executeJavaScript(script);
            return;
          }
        }
      }
    }
    throw new Error('No browser view found');
  }, key);
}
