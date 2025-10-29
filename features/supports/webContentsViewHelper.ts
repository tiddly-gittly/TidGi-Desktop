import { WebContentsView } from 'electron';
import type { ElectronApplication } from 'playwright';

/**
 * Get the first WebContentsView from any window
 * Prioritizes main window, but will check all windows if needed
 */
async function getFirstWebContentsView(app: ElectronApplication) {
  return await app.evaluate(async ({ BrowserWindow }) => {
    const allWindows = BrowserWindow.getAllWindows();

    // First try to find main window
    const mainWindow = allWindows.find(w => !w.isDestroyed() && w.webContents?.getType() === 'window');

    if (mainWindow?.contentView && 'children' in mainWindow.contentView) {
      const children = (mainWindow.contentView as WebContentsView).children as WebContentsView[];
      if (Array.isArray(children) && children.length > 0) {
        const webContentsId = children[0]?.webContents?.id;
        if (webContentsId) return webContentsId;
      }
    }

    // If main window doesn't have a WebContentsView, check all windows
    for (const window of allWindows) {
      if (!window.isDestroyed() && window.contentView && 'children' in window.contentView) {
        const children = (window.contentView as WebContentsView).children as WebContentsView[];
        if (Array.isArray(children) && children.length > 0) {
          const webContentsId = children[0]?.webContents?.id;
          if (webContentsId) return webContentsId;
        }
      }
    }

    return null;
  });
}

/**
 * Execute JavaScript in the browser view
 */
async function executeInBrowserView<T>(
  app: ElectronApplication,
  script: string,
): Promise<T> {
  const webContentsId = await getFirstWebContentsView(app);

  if (!webContentsId) {
    throw new Error('No WebContentsView found in main window');
  }

  return await app.evaluate(
    async ({ webContents }, [id, scriptContent]) => {
      const targetWebContents = webContents.fromId(id as number);
      if (!targetWebContents) {
        throw new Error('WebContents not found');
      }
      const result: T = await targetWebContents.executeJavaScript(scriptContent as string, true) as T;
      return result;
    },
    [webContentsId, script],
  );
}

/**
 * Get text content from WebContentsView
 */
export async function getTextContent(app: ElectronApplication): Promise<string | null> {
  try {
    return await executeInBrowserView<string>(
      app,
      'document.body.textContent || document.body.innerText || ""',
    );
  } catch {
    return null;
  }
}

/**
 * Get DOM content from WebContentsView
 */
export async function getDOMContent(app: ElectronApplication): Promise<string | null> {
  try {
    return await executeInBrowserView<string>(
      app,
      'document.documentElement.outerHTML || ""',
    );
  } catch {
    return null;
  }
}

/**
 * Check if WebContentsView exists and is loaded
 */
export async function isLoaded(app: ElectronApplication): Promise<boolean> {
  const webContentsId = await getFirstWebContentsView(app);
  if (webContentsId === null) {
    return false;
  }

  // Check if the WebContents is actually loaded
  return await app.evaluate(
    async ({ webContents }, id: number) => {
      const targetWebContents = webContents.fromId(id);
      if (!targetWebContents) {
        return false;
      }
      // Check if the page has finished loading
      return !targetWebContents.isLoading() && targetWebContents.getURL() !== '' && targetWebContents.getURL() !== 'about:blank';
    },
    webContentsId,
  );
}

/**
 * Click element containing specific text in browser view
 */
export async function clickElementWithText(
  app: ElectronApplication,
  selector: string,
  text: string,
): Promise<void> {
  const script = `
    (function() {
      try {
        const selector = ${JSON.stringify(selector)};
        const text = ${JSON.stringify(text)};
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
          return { error: 'Element with text "' + text + '" not found in selector: ' + selector };
        }
        
        found.click();
        return { success: true };
      } catch (error) {
        return { error: error.message || String(error) };
      }
    })()
  `;

  const result = await executeInBrowserView(app, script);
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(String(result.error));
  }
}

/**
 * Click element in browser view
 */
export async function clickElement(app: ElectronApplication, selector: string): Promise<void> {
  const script = `
    (function() {
      try {
        const selector = ${JSON.stringify(selector)};
        const elem = document.querySelector(selector);
        
        if (!elem) {
          return { error: 'Element not found: ' + selector };
        }
        
        elem.click();
        return { success: true };
      } catch (error) {
        return { error: error.message || String(error) };
      }
    })()
  `;

  const result = await executeInBrowserView(app, script);
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(String(result.error));
  }
}

/**
 * Type text in element in browser view
 */
export async function typeText(app: ElectronApplication, selector: string, text: string): Promise<void> {
  const escapedSelector = selector.replace(/'/g, "\\'");
  const escapedText = text.replace(/'/g, "\\'").replace(/\n/g, '\\n');

  const script = `
    (function() {
      try {
        const selector = '${escapedSelector}';
        const text = '${escapedText}';
        const elem = document.querySelector(selector);
        
        if (!elem) {
          return { error: 'Element not found: ' + selector };
        }
        
        elem.focus();
        if (elem.tagName === 'TEXTAREA' || elem.tagName === 'INPUT') {
          elem.value = text;
        } else {
          elem.textContent = text;
        }
        
        elem.dispatchEvent(new Event('input', { bubbles: true }));
        elem.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      } catch (error) {
        return { error: error.message || String(error) };
      }
    })()
  `;

  const result = await executeInBrowserView(app, script);
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(String(result.error));
  }
}

/**
 * Press key in browser view
 */
export async function pressKey(app: ElectronApplication, key: string): Promise<void> {
  const escapedKey = key.replace(/'/g, "\\'");

  const script = `
    (function() {
      const key = '${escapedKey}';
      
      const keydownEvent = new KeyboardEvent('keydown', {
        key: key,
        code: key,
        bubbles: true,
        cancelable: true
      });
      document.activeElement?.dispatchEvent(keydownEvent);
      
      const keyupEvent = new KeyboardEvent('keyup', {
        key: key,
        code: key,
        bubbles: true,
        cancelable: true
      });
      document.activeElement?.dispatchEvent(keyupEvent);
      return true;
    })()
  `;

  await executeInBrowserView(app, script);
}

/**
 * Check if element exists in browser view
 */
export async function elementExists(app: ElectronApplication, selector: string): Promise<boolean> {
  try {
    // Check if selector contains :has-text() pseudo-selector
    const hasTextMatch = selector.match(/^(.+):has-text\(['"](.+)['"]\)$/);

    if (hasTextMatch) {
      const baseSelector = hasTextMatch[1];
      const textContent = hasTextMatch[2];

      const script = `
        (function() {
          const elements = document.querySelectorAll('${baseSelector.replace(/'/g, "\\'")}');
          for (const el of elements) {
            if (el.textContent && el.textContent.includes('${textContent.replace(/'/g, "\\'")}')) {
              return true;
            }
          }
          return false;
        })()
      `;

      return await executeInBrowserView<boolean>(app, script);
    } else {
      const script = `document.querySelector('${selector.replace(/'/g, "\\'")}') !== null`;
      return await executeInBrowserView<boolean>(app, script);
    }
  } catch {
    return false;
  }
}
