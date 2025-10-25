import { Then, When } from '@cucumber/cucumber';
import fs from 'fs-extra';
import path from 'path';
import type { IWorkspace } from '../../src/services/workspaces/interface';
import { settingsPath, wikiTestWikiPath } from '../supports/paths';
import type { ApplicationWorld } from './application';

When('I cleanup test wiki so it could create a new one on start', async function() {
  if (fs.existsSync(wikiTestWikiPath)) fs.removeSync(wikiTestWikiPath);

  type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
  if (!fs.existsSync(settingsPath)) return;
  const settings = fs.readJsonSync(settingsPath) as SettingsFile;
  const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};
  const filtered: Record<string, IWorkspace> = {};
  for (const id of Object.keys(workspaces)) {
    const ws = workspaces[id];
    const name = ws.name;
    if (name === 'wiki' || id === 'wiki') continue;
    filtered[id] = ws;
  }
  fs.writeJsonSync(settingsPath, { ...settings, workspaces: filtered }, { spaces: 2 });
});

/**
 * Click element in wiki webview (TiddlyWiki content)
 */
When('I click on element with selector {string} in wiki webview', async function(this: ApplicationWorld, selector: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.waitForTimeout(1000);

    await currentWindow.evaluate(async (webviewSelector: string) => {
      const webview = document.querySelector('webview');
      if (!webview) throw new Error('Webview not found');

      // @ts-expect-error - Electron webview methods not available in DOM types
      if (!webview.getWebContentsId()) {
        await new Promise<void>((resolve) => {
          webview.addEventListener('dom-ready', () => {
            resolve();
          });
        });
      }

      // @ts-expect-error - Electron webview methods not available in DOM types
      await webview.executeJavaScript(`
        (function() {
          const element = document.querySelector('${webviewSelector}');
          if (!element) throw new Error('Element not found in webview: ${webviewSelector}');
          element.click();
        })();
      `);
    }, selector);

    await currentWindow.waitForTimeout(500);
  } catch (error) {
    throw new Error(`Failed to click element in wiki webview with selector "${selector}": ${error as Error}`);
  }
});

/**
 * Type text in element in wiki webview
 */
When('I type {string} in element with selector {string} in wiki webview', async function(this: ApplicationWorld, text: string, selector: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.waitForTimeout(500);

    await currentWindow.evaluate(async (arguments_: { selector: string; text: string }) => {
      const webview = document.querySelector('webview');
      if (!webview) throw new Error('Webview not found');

      // @ts-expect-error - Electron webview methods not available in DOM types
      if (!webview.getWebContentsId()) {
        await new Promise<void>((resolve) => {
          webview.addEventListener('dom-ready', () => {
            resolve();
          });
        });
      }

      // @ts-expect-error - Electron webview methods not available in DOM types
      await webview.executeJavaScript(`
        (function() {
          const element = document.querySelector('${arguments_.selector}');
          if (!element) throw new Error('Element not found in webview: ${arguments_.selector}');
          
          element.focus();
          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            element.value = '${arguments_.text.replace(/'/g, "\\'")}';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            element.textContent = '${arguments_.text.replace(/'/g, "\\'")}';
          }
        })();
      `);
    }, { selector, text });

    await currentWindow.waitForTimeout(500);
  } catch (error) {
    throw new Error(`Failed to type in wiki webview element with selector "${selector}": ${error as Error}`);
  }
});

/**
 * Press key in wiki webview
 */
When('I press {string} in wiki webview', async function(this: ApplicationWorld, key: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.evaluate(async (keyToPress: string) => {
      const webview = document.querySelector('webview');
      if (!webview) throw new Error('Webview not found');

      // @ts-expect-error - Electron webview methods not available in DOM types
      if (!webview.getWebContentsId()) {
        await new Promise<void>((resolve) => {
          webview.addEventListener('dom-ready', () => {
            resolve();
          });
        });
      }

      // @ts-expect-error - Electron webview methods not available in DOM types
      await webview.executeJavaScript(`
        (function() {
          const event = new KeyboardEvent('keydown', {
            key: '${keyToPress}',
            code: '${keyToPress}',
            bubbles: true,
            cancelable: true
          });
          document.activeElement?.dispatchEvent(event);
          
          const keyupEvent = new KeyboardEvent('keyup', {
            key: '${keyToPress}',
            code: '${keyToPress}',
            bubbles: true,
            cancelable: true
          });
          document.activeElement?.dispatchEvent(keyupEvent);
        })();
      `);
    }, key);

    await currentWindow.waitForTimeout(300);
  } catch (error) {
    throw new Error(`Failed to press "${key}" in wiki webview: ${error as Error}`);
  }
});

/**
 * Verify file exists in directory
 */
Then('file {string} should exist in {string}', async function(this: ApplicationWorld, fileName: string, directoryPath: string) {
  const actualPath = directoryPath.replace('{tmpDir}', wikiTestWikiPath);
  const filePath = path.join(actualPath, fileName);

  let exists = false;
  for (let index = 0; index < 20; index++) {
    if (await fs.pathExists(filePath)) {
      exists = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!exists) {
    throw new Error(`File "${fileName}" not found in directory: ${actualPath}`);
  }
});

/**
 * Cleanup function for sub-wiki routing test
 * Removes test workspaces created during the test
 */
function clearSubWikiRoutingTestData() {
  if (!fs.existsSync(settingsPath)) return;

  type SettingsFile = { workspaces?: Record<string, IWorkspace> } & Record<string, unknown>;
  const settings = fs.readJsonSync(settingsPath) as SettingsFile;
  const workspaces: Record<string, IWorkspace> = settings.workspaces ?? {};
  const filtered: Record<string, IWorkspace> = {};

  // Remove test workspaces (MainWiki, SubWiki, etc from sub-wiki routing tests)
  for (const id of Object.keys(workspaces)) {
    const ws = workspaces[id];
    const name = ws.name;
    // Keep workspaces that don't match test patterns
    if (name !== 'MainWiki' && name !== 'SubWiki') {
      filtered[id] = ws;
    }
  }

  fs.writeJsonSync(settingsPath, { ...settings, workspaces: filtered }, { spaces: 2 });

  // Remove test wiki folders from filesystem
  const testFolders = ['MainWiki', 'SubWiki'];
  for (const folder of testFolders) {
    const wikiPath = path.join(wikiTestWikiPath, folder);
    if (fs.existsSync(wikiPath)) {
      fs.removeSync(wikiPath);
    }
  }
}

export { clearSubWikiRoutingTestData };
