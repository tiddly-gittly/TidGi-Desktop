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
