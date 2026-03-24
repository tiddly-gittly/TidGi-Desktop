import { WebContentsView } from 'electron';
import fs from 'fs-extra';
import type { ElectronApplication, Page } from 'playwright';

async function getWindowUrl(page: Page | undefined): Promise<string | undefined> {
  if (!page || page.isClosed()) {
    return undefined;
  }
  try {
    const url = page.url();
    return url || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get the active WebContentsView from the target window.
 * When multiple wiki views exist, the LAST child is preferred because
 * showView() / addView() calls addChildView() which moves the view to the top.
 */
async function getFirstWebContentsView(app: ElectronApplication, page?: Page) {
  const pageUrl = await getWindowUrl(page);
  return await app.evaluate(async ({ BrowserWindow }, targetPageUrl?: string) => {
    const allWindows = BrowserWindow.getAllWindows();

    const getViewIdFromWindow = (window: Electron.BrowserWindow) => {
      if (!window.contentView || !('children' in window.contentView)) {
        return null;
      }

      const children = (window.contentView as WebContentsView).children as WebContentsView[];
      if (!Array.isArray(children) || children.length === 0) {
        return null;
      }

      const candidateInfos = children
        .map((child) => {
          const wc = child?.webContents;
          if (!wc) return undefined;
          return {
            id: wc.id,
            url: wc.getURL(),
          };
        })
        .filter((info): info is { id: number; url: string } => Boolean(info));

      for (let index = candidateInfos.length - 1; index >= 0; index--) {
        if (candidateInfos[index].url.startsWith('tidgi://')) {
          return candidateInfos[index].id;
        }
      }

      const nonBlank = candidateInfos.find(info => info.url && info.url !== 'about:blank');
      if (nonBlank) {
        return nonBlank.id;
      }

      return candidateInfos[0]?.id ?? null;
    };

    if (targetPageUrl) {
      const targetWindow = allWindows.find(w => !w.isDestroyed() && w.webContents?.getURL() === targetPageUrl);
      if (targetWindow) {
        const targetViewId = getViewIdFromWindow(targetWindow);
        if (targetViewId) {
          return targetViewId;
        }
      }
    }

    const mainWindow = allWindows.find(w => !w.isDestroyed() && w.webContents?.getType() === 'window');

    if (mainWindow) {
      const mainViewId = getViewIdFromWindow(mainWindow);
      if (mainViewId) {
        return mainViewId;
      }
    }

    for (const window of allWindows) {
      if (window.isDestroyed()) {
        continue;
      }
      const fallbackViewId = getViewIdFromWindow(window);
      if (fallbackViewId) {
        return fallbackViewId;
      }
    }

    return null;
  }, pageUrl);
}

/**
 * Execute JavaScript in the browser view
 */
async function executeInBrowserView<T>(
  app: ElectronApplication,
  script: string,
  page?: Page,
  timeoutMs = 2000,
): Promise<T> {
  const webContentsId = await getFirstWebContentsView(app, page);

  if (!webContentsId) {
    throw new Error('No WebContentsView found in main window');
  }

  return await app.evaluate(
    async ({ webContents }, [id, scriptContent, timeoutInMs]) => {
      const targetWebContents = webContents.fromId(id as number);
      if (!targetWebContents) {
        throw new Error('WebContents not found');
      }
      const result: T = await Promise.race([
        targetWebContents.executeJavaScript(scriptContent as string, true),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            reject(new Error('executeInBrowserView timed out (page navigating?)'));
          }, timeoutInMs as number)
        ),
      ]) as T;
      return result;
    },
    [webContentsId, script, timeoutMs],
  );
}

/**
 * Get text content from WebContentsView
 */
export async function getTextContent(app: ElectronApplication, page?: Page): Promise<string | null> {
  try {
    return await executeInBrowserView<string>(
      app,
      'document.body.textContent || document.body.innerText || ""',
      page,
      2000,
    );
  } catch {
    return null;
  }
}

/**
 * Get DOM content from WebContentsView
 */
export async function getDOMContent(app: ElectronApplication, page?: Page): Promise<string | null> {
  try {
    return await executeInBrowserView<string>(
      app,
      'document.documentElement.outerHTML || ""',
      page,
    );
  } catch {
    return null;
  }
}

/**
 * Check if WebContentsView exists and is loaded
 */
export async function isLoaded(app: ElectronApplication, page?: Page): Promise<boolean> {
  const webContentsId = await getFirstWebContentsView(app, page);
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
      const url = targetWebContents.getURL();
      if (!url || url === 'about:blank') {
        return false;
      }

      if (url.startsWith('tidgi://')) {
        return true;
      }

      return !targetWebContents.isLoading();
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
  page?: Page,
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

  const result = await executeInBrowserView(app, script, page);
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(String(result.error));
  }
}

/**
 * Click element in browser view
 */
export async function clickElement(app: ElectronApplication, selector: string, page?: Page): Promise<void> {
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

  const result = await executeInBrowserView(app, script, page);
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(String(result.error));
  }
}

/**
 * Type text in element in browser view
 */
export async function typeText(app: ElectronApplication, selector: string, text: string, page?: Page): Promise<void> {
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

  const result = await executeInBrowserView(app, script, page);
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(String(result.error));
  }
}

/**
 * Press key in browser view
 */
export async function pressKey(app: ElectronApplication, key: string, page?: Page): Promise<void> {
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

  await executeInBrowserView(app, script, page);
}

/**
 * Check if element exists in browser view
 */
export async function elementExists(app: ElectronApplication, selector: string, page?: Page): Promise<boolean> {
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

      return await executeInBrowserView<boolean>(app, script, page);
    } else {
      const script = `document.querySelector('${selector.replace(/'/g, "\\'")}') !== null`;
      return await executeInBrowserView<boolean>(app, script, page);
    }
  } catch {
    return false;
  }
}

/**
 * Capture screenshot of WebContentsView with timeout
 * Returns true if screenshot capture started successfully, false if failed or timeout
 * File writing continues asynchronously in background if capture succeeds
 */
export async function captureScreenshot(app: ElectronApplication, screenshotPath: string): Promise<boolean> {
  try {
    // Add timeout to prevent screenshot from blocking test execution
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, 500);
    });

    const capturePromise = (async () => {
      const webContentsId = await getFirstWebContentsView(app);
      if (!webContentsId) {
        return null;
      }

      const pngBufferData = await app.evaluate(
        async ({ webContents }, id: number) => {
          const targetWebContents = webContents.fromId(id);
          if (!targetWebContents || targetWebContents.isDestroyed()) {
            return null;
          }

          try {
            const image = await targetWebContents.capturePage();
            const pngBuffer = image.toPNG();
            return Array.from(pngBuffer);
          } catch {
            return null;
          }
        },
        webContentsId,
      );

      return pngBufferData;
    })();

    const result = await Promise.race([capturePromise, timeoutPromise]);

    // If we got the screenshot data, write it to file asynchronously (fire and forget)
    if (result && Array.isArray(result)) {
      fs.writeFile(screenshotPath, Buffer.from(result)).catch(() => {
        // Silently ignore write errors
      });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Capture screenshot of a Playwright Page's underlying Electron window.
 * Uses Electron's native webContents.capturePage() which works even when
 * the window is hidden (unlike Playwright's page.screenshot()).
 */
export async function captureWindowScreenshot(app: ElectronApplication, page: Page, screenshotPath: string): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, 500);
    });

    const capturePromise = (async () => {
      // Evaluate inside Electron to find the BrowserWindow matching this page's webContents
      const pngBufferData = await app.evaluate(
        async ({ BrowserWindow }, pageUrl: string) => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue;
            if (win.webContents.getURL() === pageUrl) {
              try {
                const image = await win.webContents.capturePage();
                return Array.from(image.toPNG());
              } catch {
                return null;
              }
            }
          }
          return null;
        },
        page.url(),
      );
      return pngBufferData;
    })();

    const result = await Promise.race([capturePromise, timeoutPromise]);
    if (result && Array.isArray(result)) {
      fs.writeFile(screenshotPath, Buffer.from(result)).catch(() => {});
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Execute TiddlyWiki code in the browser view
 * Useful for directly manipulating the wiki, e.g., opening tiddlers
 */
export async function executeTiddlyWikiCode<T>(
  app: ElectronApplication,
  code: string,
  page?: Page,
  timeoutMs = 200,
): Promise<T | null> {
  let webContentsId = await getFirstWebContentsView(app, page);

  if (!webContentsId) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      webContentsId = await getFirstWebContentsView(app, page);
      if (webContentsId) {
        break;
      }
    }
  }

  if (!webContentsId) {
    throw new Error('No WebContentsView found');
  }

  return await app.evaluate(
    async ({ webContents }, [id, codeContent, timeoutInMs]) => {
      const targetWebContents = webContents.fromId(id as number);
      if (!targetWebContents) {
        throw new Error('WebContents not found');
      }
      /**
       * executeJavaScript can hang indefinitely when the webContents is navigating
       * (e.g. during a wiki restart retry loop). Race against a 200 ms timeout so
       * backOff callers get fast failures and can retry until the page is ready.
       * 200ms gives ~6 retries within the 5s Cucumber step budget even during a
       * ~12s simplified-wiki restart (8s pre-wait + 3.5s for wiki to become ready).
       */
      const result: T = await Promise.race([
        targetWebContents.executeJavaScript(codeContent as string, true),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            reject(new Error('executeJavaScript timed out (page navigating?)'));
          }, timeoutInMs as number)
        ),
      ]) as T;
      return result;
    },
    [webContentsId, code, timeoutMs],
  );
}
