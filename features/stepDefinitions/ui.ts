import { Then, When } from '@cucumber/cucumber';
import type { ApplicationWorld } from './application';

When('I wait for {float} seconds', async function(this: ApplicationWorld, seconds: number) {
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
});

When('I wait for the page to load completely', async function(this: ApplicationWorld) {
  const currentWindow = this.currentWindow || this.mainWindow;
  await currentWindow?.waitForLoadState('networkidle', { timeout: 30000 });
});

Then('I should see a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  try {
    await currentWindow?.waitForSelector(selector, { timeout: 10000 });
    const isVisible = await currentWindow?.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is not visible`);
    }
  } catch (error) {
    throw new Error(`Failed to find ${elementComment} with selector "${selector}": ${error as Error}`);
  }
});

When('I click on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const targetWindow = await this.getWindow('current');

  if (!targetWindow) {
    throw new Error(`Window "current" is not available`);
  }

  try {
    await targetWindow.waitForSelector(selector, { timeout: 10000 });
    const isVisible = await targetWindow.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is not visible`);
    }
    await targetWindow.click(selector);
  } catch (error) {
    throw new Error(`Failed to find and click ${elementComment} with selector "${selector}" in current window: ${error as Error}`);
  }
});

When('I right-click on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const targetWindow = await this.getWindow('current');

  if (!targetWindow) {
    throw new Error(`Window "current" is not available`);
  }

  try {
    await targetWindow.waitForSelector(selector, { timeout: 10000 });
    const isVisible = await targetWindow.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is not visible`);
    }
    await targetWindow.click(selector, { button: 'right' });
  } catch (error) {
    throw new Error(`Failed to find and right-click ${elementComment} with selector "${selector}" in current window: ${error as Error}`);
  }
});

When('I click all {string} elements matching selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const win = this.currentWindow || this.mainWindow;
  if (!win) throw new Error('No active window available to click elements');

  const locator = win.locator(selector);
  const count = await locator.count();
  if (count === 0) {
    throw new Error(`No elements found for ${elementComment} with selector "${selector}"`);
  }

  // Single-pass reverse iteration to avoid index shift issues
  for (let index = count - 1; index >= 0; index--) {
    try {
      await locator.nth(index).scrollIntoViewIfNeeded().catch(() => {});
      await locator.nth(index).click({ force: true, timeout: 500 });
    } catch (error) {
      throw new Error(`Failed to click ${elementComment} at index ${index} with selector "${selector}": ${error as Error}`);
    }
  }
});

When('I type {string} in {string} element with selector {string}', async function(this: ApplicationWorld, text: string, elementComment: string, selector: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.waitForSelector(selector, { timeout: 10000 });
    const element = currentWindow.locator(selector);
    await element.fill(text);
  } catch (error) {
    throw new Error(`Failed to type in ${elementComment} element with selector "${selector}": ${error as Error}`);
  }
});

When('I clear text in {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.waitForSelector(selector, { timeout: 10000 });
    const element = currentWindow.locator(selector);
    await element.clear();
  } catch (error) {
    throw new Error(`Failed to clear text in ${elementComment} element with selector "${selector}": ${error as Error}`);
  }
});

// Minimal text checking for smoke test
When('I should not see text {string}', async function(this: ApplicationWorld, text: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const bodyContent = await currentWindow.textContent('body');
  if (bodyContent?.includes(text)) {
    throw new Error(`Text "${text}" should not be visible but was found on the page`);
  }
});

When('the window title should contain {string}', async function(this: ApplicationWorld, expectedTitle: string) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    const title = await currentWindow.title();
    if (!title.includes(expectedTitle)) {
      throw new Error(`Window title "${title}" does not contain "${expectedTitle}"`);
    }
  } catch (error) {
    throw new Error(`Failed to check window title: ${error as Error}`);
  }
});

// Generic keyboard action
When('I press {string} key', async function(this: ApplicationWorld, key: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  await currentWindow.keyboard.press(key);
});

// Generic window switching - sets currentWindow state for subsequent operations
// You may need to wait a second before switch, otherwise window's URL may not set yet.
When('I switch to {string} window', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }
  const targetWindow = await this.getWindow(windowType);
  if (targetWindow) {
    this.currentWindow = targetWindow; // Set currentWindow state
  } else {
    throw new Error(`Could not find ${windowType} window`);
  }
});

// Generic window closing
When('I close {string} window', async function(this: ApplicationWorld, windowType: string) {
  if (!this.app) {
    throw new Error('Application is not available');
  }
  const targetWindow = await this.getWindow(windowType);
  if (targetWindow) {
    await targetWindow.close();
  } else {
    throw new Error(`Could not find ${windowType} window to close`);
  }
});
