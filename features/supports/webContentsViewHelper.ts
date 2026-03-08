import { WebContentsView } from 'electron';
import fs from 'fs-extra';
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
        const candidateInfos = children
          .map((child) => {
            const wc = child?.webContents;
            if (!wc) return undefined;
            return {
              id: wc.id,
              url: wc.getURL(),
              isLoading: wc.isLoading(),
            };
          })
          .filter((info): info is { id: number; url: string; isLoading: boolean } => Boolean(info));

        // Prefer an already-loaded wiki view (tidgi://...) for deterministic test behavior.
        const readyWiki = candidateInfos.find(info => info.url.startsWith('tidgi://') && !info.isLoading);
        if (readyWiki) return readyWiki.id;

        // Then prefer any wiki view even if still loading.
        const anyWiki = candidateInfos.find(info => info.url.startsWith('tidgi://'));
        if (anyWiki) return anyWiki.id;

        // Fallback to first non-empty URL.
        const nonBlank = candidateInfos.find(info => info.url && info.url !== 'about:blank');
        if (nonBlank) return nonBlank.id;

        const webContentsId = candidateInfos[0]?.id;
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
  timeoutMs = 2000,
): Promise<T> {
  const webContentsId = await getFirstWebContentsView(app);

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
export async function getTextContent(app: ElectronApplication): Promise<string | null> {
  try {
    return await executeInBrowserView<string>(
      app,
      'document.body.textContent || document.body.innerText || ""',
      2000,
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
 * Execute TiddlyWiki code in the browser view
 * Useful for directly manipulating the wiki, e.g., opening tiddlers
 */
export async function executeTiddlyWikiCode<T>(
  app: ElectronApplication,
  code: string,
  timeoutMs = 200,
): Promise<T | null> {
  let webContentsId = await getFirstWebContentsView(app);

  if (!webContentsId) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      webContentsId = await getFirstWebContentsView(app);
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
