import { DataTable, Then, When } from '@cucumber/cucumber';
import type { ApplicationWorld } from './application';

When('I wait for {float} seconds', async function(this: ApplicationWorld, seconds: number) {
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
});

When('I wait for the page to load completely', async function(this: ApplicationWorld) {
  const currentWindow = this.currentWindow;
  await currentWindow?.waitForLoadState('networkidle', { timeout: 30000 });
});

Then('I should see a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const currentWindow = this.currentWindow;

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

Then('I should see {string} elements with selectors:', async function(this: ApplicationWorld, elementDescriptions: string, dataTable: DataTable) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const descriptions = elementDescriptions.split(' and ').map(d => d.trim());
  const rows = dataTable.raw();
  const errors: string[] = [];

  if (descriptions.length !== rows.length) {
    throw new Error(`Mismatch: ${descriptions.length} element descriptions but ${rows.length} selectors provided`);
  }

  // Check all elements in parallel for better performance
  await Promise.all(rows.map(async ([selector], index) => {
    const elementComment = descriptions[index];
    try {
      await currentWindow.waitForSelector(selector, { timeout: 10000 });
      const isVisible = await currentWindow.isVisible(selector);
      if (!isVisible) {
        errors.push(`Element "${elementComment}" with selector "${selector}" is not visible`);
      }
    } catch (error) {
      errors.push(`Failed to find "${elementComment}" with selector "${selector}": ${error as Error}`);
    }
  }));

  if (errors.length > 0) {
    throw new Error(`Failed to find elements:\n${errors.join('\n')}`);
  }
});

Then('I should not see a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }
  try {
    const element = currentWindow.locator(selector).first();
    const count = await element.count();
    if (count > 0) {
      const isVisible = await element.isVisible();
      if (isVisible) {
        // Get parent element HTML for debugging
        let parentHtml = '';
        try {
          const parent = element.locator('xpath=..');
          parentHtml = await parent.evaluate((node) => node.outerHTML);
        } catch {
          parentHtml = 'Failed to get parent HTML';
        }
        throw new Error(
          `Element "${elementComment}" with selector "${selector}" should not be visible but was found\n` +
            `Parent element HTML:\n${parentHtml}`,
        );
      }
    }
    // Element not found or not visible - this is expected
  } catch (error) {
    // If the error is our custom error, rethrow it
    if (error instanceof Error && error.message.includes('should not be visible')) {
      throw error;
    }
    // Otherwise, element not found is expected - pass the test
  }
});

Then('I should not see {string} elements with selectors:', async function(this: ApplicationWorld, elementDescriptions: string, dataTable: DataTable) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const descriptions = elementDescriptions.split(' and ').map(d => d.trim());
  const rows = dataTable.raw();
  const errors: string[] = [];

  if (descriptions.length !== rows.length) {
    throw new Error(`Mismatch: ${descriptions.length} element descriptions but ${rows.length} selectors provided`);
  }

  // Check all elements
  for (let index = 0; index < rows.length; index++) {
    const [selector] = rows[index];
    const elementComment = descriptions[index];
    try {
      const element = currentWindow.locator(selector).first();
      const count = await element.count();
      if (count > 0) {
        const isVisible = await element.isVisible();
        if (isVisible) {
          errors.push(`Element "${elementComment}" with selector "${selector}" should not be visible but was found`);
        }
      }
      // Element not found or not visible - this is expected
    } catch (error) {
      // If the error is our custom error, rethrow it
      if (error instanceof Error && error.message.includes('should not be visible')) {
        errors.push(error.message);
      }
      // Otherwise, element not found is expected - continue
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to verify elements are not visible:\n${errors.join('\n')}`);
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

When('I click on {string} elements with selectors:', async function(this: ApplicationWorld, elementDescriptions: string, dataTable: DataTable) {
  const targetWindow = await this.getWindow('current');

  if (!targetWindow) {
    throw new Error('Window "current" is not available');
  }

  const descriptions = elementDescriptions.split(' and ').map(d => d.trim());
  const rows = dataTable.raw();
  const errors: string[] = [];

  if (descriptions.length !== rows.length) {
    throw new Error(`Mismatch: ${descriptions.length} element descriptions but ${rows.length} selectors provided`);
  }

  // Click elements sequentially (not in parallel) to maintain order and avoid race conditions
  for (let index = 0; index < rows.length; index++) {
    const [selector] = rows[index];
    const elementComment = descriptions[index];
    try {
      await targetWindow.waitForSelector(selector, { timeout: 10000 });
      const isVisible = await targetWindow.isVisible(selector);
      if (!isVisible) {
        errors.push(`Element "${elementComment}" with selector "${selector}" is not visible`);
        continue;
      }
      await targetWindow.click(selector);
    } catch (error) {
      errors.push(`Failed to find and click "${elementComment}" with selector "${selector}": ${error as Error}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to click elements:\n${errors.join('\n')}`);
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
  const win = this.currentWindow;
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
  const currentWindow = this.currentWindow;
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
  const currentWindow = this.currentWindow;
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

When('the window title should contain {string}', async function(this: ApplicationWorld, expectedTitle: string) {
  const currentWindow = this.currentWindow;
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

When('I press the key combination {string}', async function(this: ApplicationWorld, keyCombo: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  // Convert CommandOrControl to platform-specific key
  let platformKeyCombo = keyCombo;
  if (keyCombo.includes('CommandOrControl')) {
    // On Windows and Linux, use Control; on macOS, use Meta (Cmd)
    const isWindows = process.platform === 'win32';
    const isLinux = process.platform === 'linux';
    if (isWindows || isLinux) {
      platformKeyCombo = keyCombo.replace('CommandOrControl', 'Control');
    } else {
      platformKeyCombo = keyCombo.replace('CommandOrControl', 'Meta');
    }
  }

  // Use dispatchEvent to trigger document-level keydown events
  // This ensures the event is properly captured by React components listening to document events
  // The testKeyboardShortcutFallback in test environment expects key to match the format used in shortcuts
  await currentWindow.evaluate((keyCombo) => {
    const parts = keyCombo.split('+');
    let mainKey = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    // For single letter keys, match the case sensitivity used by the shortcut system
    // Shift+Key -> uppercase, otherwise lowercase
    if (mainKey.length === 1) {
      mainKey = modifiers.includes('Shift') ? mainKey.toUpperCase() : mainKey.toLowerCase();
    }

    const event = new KeyboardEvent('keydown', {
      key: mainKey,
      code: mainKey.length === 1 ? `Key${mainKey.toUpperCase()}` : mainKey,
      ctrlKey: modifiers.includes('Control'),
      metaKey: modifiers.includes('Meta'),
      shiftKey: modifiers.includes('Shift'),
      altKey: modifiers.includes('Alt'),
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);
  }, platformKeyCombo);
});

When('I select {string} from MUI Select with test id {string}', async function(this: ApplicationWorld, optionValue: string, testId: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    // Find the hidden input element with the test-id
    const inputSelector = `input[data-testid="${testId}"]`;
    await currentWindow.waitForSelector(inputSelector, { timeout: 10000 });

    // Try to click using Playwright's click on the div with role="combobox"
    // According to your HTML structure, the combobox is a sibling of the input
    const clicked = await currentWindow.evaluate((testId) => {
      const input = document.querySelector(`input[data-testid="${testId}"]`);
      if (!input) return { success: false, error: 'Input not found' };
      const parent = input.parentElement;
      if (!parent) return { success: false, error: 'Parent not found' };

      // Find all elements in parent
      const combobox = parent.querySelector('[role="combobox"]');
      if (!combobox) {
        return {
          success: false,
          error: 'Combobox not found',
          parentHTML: parent.outerHTML.substring(0, 500),
        };
      }

      // Trigger both mousedown and click events
      combobox.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      combobox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      (combobox as HTMLElement).click();

      return { success: true };
    }, testId);

    if (!clicked.success) {
      throw new Error(`Failed to click: ${JSON.stringify(clicked)}`);
    }

    // Wait a bit for the menu to appear
    await currentWindow.waitForTimeout(500);

    // Wait for the menu to appear
    await currentWindow.waitForSelector('[role="listbox"]', { timeout: 5000 });

    // Try to click on the option with the specified value (data-value attribute)
    // If not found, try to find by text content
    const optionClicked = await currentWindow.evaluate((optionValue) => {
      // First try: Find by data-value attribute
      const optionByValue = document.querySelector(`[role="option"][data-value="${optionValue}"]`);
      if (optionByValue) {
        (optionByValue as HTMLElement).click();
        return { success: true, method: 'data-value' };
      }

      // Second try: Find by text content (case-insensitive)
      const allOptions = Array.from(document.querySelectorAll('[role="option"]'));
      const optionByText = allOptions.find(option => {
        const text = option.textContent?.trim().toLowerCase();
        return text === optionValue.toLowerCase();
      });

      if (optionByText) {
        (optionByText as HTMLElement).click();
        return { success: true, method: 'text-content' };
      }

      // Return available options for debugging
      return {
        success: false,
        availableOptions: allOptions.map(opt => ({
          text: opt.textContent?.trim(),
          value: opt.getAttribute('data-value'),
        })),
      };
    }, optionValue);

    if (!optionClicked.success) {
      throw new Error(
        `Could not find option "${optionValue}". Available options: ${JSON.stringify(optionClicked.availableOptions)}`,
      );
    }

    // Wait for the menu to close
    await currentWindow.waitForSelector('[role="listbox"]', { state: 'hidden', timeout: 5000 });
  } catch (error) {
    throw new Error(`Failed to select option "${optionValue}" from MUI Select with test id "${testId}": ${String(error)}`);
  }
});
