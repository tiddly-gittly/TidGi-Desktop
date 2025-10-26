import { Then, When } from '@cucumber/cucumber';
import { clickElement, clickElementWithText, getDOMContent, getTextContent, isLoaded, pressKey, typeText } from '../supports/webContentsViewHelper';
import type { ApplicationWorld } from './application';

// Constants for retry logic
const MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 500;

Then('I should see {string} in the browser view content', async function(this: ApplicationWorld, expectedText: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  // Retry logic to check for expected text in content
  const maxAttempts = MAX_ATTEMPTS;
  const retryInterval = RETRY_INTERVAL_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const content = await getTextContent(this.app);
    if (content && content.includes(expectedText)) {
      return; // Success, exit early
    }

    // Wait before retrying (except for the last attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }

  // Final attempt to get content for error message
  const finalContent = await getTextContent(this.app);
  throw new Error(
    `Expected text "${expectedText}" not found in browser view content after ${MAX_ATTEMPTS} attempts. Actual content: ${
      finalContent ? finalContent.substring(0, 200) + '...' : 'null'
    }`,
  );
});

Then('I should see {string} in the browser view DOM', async function(this: ApplicationWorld, expectedText: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  // Retry logic to check for expected text in DOM
  const maxAttempts = MAX_ATTEMPTS;
  const retryInterval = RETRY_INTERVAL_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const domContent = await getDOMContent(this.app);
    if (domContent && domContent.includes(expectedText)) {
      return; // Success, exit early
    }

    // Wait before retrying (except for the last attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }

  // Final attempt to get DOM content for error message
  const finalDomContent = await getDOMContent(this.app);
  throw new Error(
    `Expected text "${expectedText}" not found in browser view DOM after ${MAX_ATTEMPTS} attempts. Actual DOM: ${
      finalDomContent ? finalDomContent.substring(0, 200) + '...' : 'null'
    }`,
  );
});

Then('the browser view should be loaded and visible', async function(this: ApplicationWorld) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  // Retry logic to check if browser view is loaded
  const maxAttempts = MAX_ATTEMPTS;
  const retryInterval = RETRY_INTERVAL_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLoadedResult = await isLoaded(this.app);
    if (isLoadedResult) {
      return; // Success, exit early
    }

    // Wait before retrying (except for the last attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }

  throw new Error(`Browser view is not loaded or visible after ${MAX_ATTEMPTS} attempts`);
});

When('I click on {string} element in browser view with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  try {
    // Check if selector contains :has-text() pseudo-selector
    const hasTextMatch = selector.match(/^(.+):has-text\(['"](.+)['"]\)$/);

    if (hasTextMatch) {
      // Extract base selector and text content
      const baseSelector = hasTextMatch[1];
      const textContent = hasTextMatch[2];
      await clickElementWithText(this.app, baseSelector, textContent);
    } else {
      // Use regular selector
      await clickElement(this.app, selector);
    }
  } catch (error) {
    throw new Error(`Failed to click ${elementComment} element with selector "${selector}" in browser view: ${error as Error}`);
  }
});

When('I type {string} in {string} element in browser view with selector {string}', async function(this: ApplicationWorld, text: string, elementComment: string, selector: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  try {
    await typeText(this.app, selector, text);
  } catch (error) {
    throw new Error(`Failed to type in ${elementComment} element with selector "${selector}" in browser view: ${error as Error}`);
  }
});

When('I press {string} in browser view', async function(this: ApplicationWorld, key: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  try {
    await pressKey(this.app, key);
  } catch (error) {
    throw new Error(`Failed to press key "${key}" in browser view: ${error as Error}`);
  }
});

Then('I should not see {string} in the browser view content', async function(this: ApplicationWorld, unexpectedText: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  // Wait a bit for UI to update
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check that text does not exist in content
  const content = await getTextContent(this.app);
  if (content && content.includes(unexpectedText)) {
    throw new Error(`Unexpected text "${unexpectedText}" found in browser view content`);
  }
});
