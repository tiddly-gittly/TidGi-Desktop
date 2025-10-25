import { Then, When } from '@cucumber/cucumber';
import { clickElement, getDOMContent, getTextContent, isLoaded, pressKey, typeText } from '../supports/webContentsViewHelper';
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

When('I click on element with selector {string} in browser view', async function(this: ApplicationWorld, selector: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }
  
  try {
    await clickElement(this.app, selector);
  } catch (error) {
    throw new Error(`Failed to click element "${selector}" in browser view: ${error as Error}`);
  }
});

When('I type {string} in element with selector {string} in browser view', async function(this: ApplicationWorld, text: string, selector: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }
  
  try {
    await typeText(this.app, selector, text);
  } catch (error) {
    throw new Error(`Failed to type in element "${selector}" in browser view: ${error as Error}`);
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
