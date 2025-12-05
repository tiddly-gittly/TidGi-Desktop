import { Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import { clickElement, clickElementWithText, elementExists, executeTiddlyWikiCode, getDOMContent, getTextContent, isLoaded, pressKey, typeText } from '../supports/webContentsViewHelper';
import type { ApplicationWorld } from './application';

// Backoff configuration for retries
const BACKOFF_OPTIONS = {
  numOfAttempts: 10,
  startingDelay: 100,
  timeMultiple: 2,
};

Then('I should see {string} in the browser view content', async function(this: ApplicationWorld, expectedText: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  await backOff(
    async () => {
      const content = await getTextContent(this.app!);
      if (!content || !content.includes(expectedText)) {
        throw new Error(`Expected text "${expectedText}" not found`);
      }
    },
    BACKOFF_OPTIONS,
  ).catch(async () => {
    const finalContent = await getTextContent(this.app!);
    throw new Error(
      `Expected text "${expectedText}" not found in browser view content. Actual content: ${finalContent ? finalContent.substring(0, 200) + '...' : 'null'}`,
    );
  });
});

Then('I should see {string} in the browser view DOM', async function(this: ApplicationWorld, expectedText: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  await backOff(
    async () => {
      const domContent = await getDOMContent(this.app!);
      if (!domContent || !domContent.includes(expectedText)) {
        throw new Error(`Expected text "${expectedText}" not found in DOM`);
      }
    },
    BACKOFF_OPTIONS,
  ).catch(async () => {
    const finalDomContent = await getDOMContent(this.app!);
    throw new Error(
      `Expected text "${expectedText}" not found in browser view DOM. Actual DOM: ${finalDomContent ? finalDomContent.substring(0, 200) + '...' : 'null'}`,
    );
  });
});

Then('the browser view should be loaded and visible', { timeout: 15000 }, async function(this: ApplicationWorld) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  await backOff(
    async () => {
      const isLoadedResult = await isLoaded(this.app!);
      if (!isLoadedResult) {
        throw new Error('Browser view not loaded');
      }
    },
    { ...BACKOFF_OPTIONS, numOfAttempts: 15 },
  ).catch(() => {
    throw new Error('Browser view is not loaded or visible after multiple attempts');
  });
});

Then('I wait for {string} element in browser view with selector {string}', { timeout: 15000 }, async function(
  this: ApplicationWorld,
  elementComment: string,
  selector: string,
) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  await backOff(
    async () => {
      const exists = await elementExists(this.app!, selector);
      if (!exists) {
        throw new Error(`Element "${elementComment}" with selector "${selector}" not found yet`);
      }
    },
    { ...BACKOFF_OPTIONS, numOfAttempts: 20, startingDelay: 200 },
  ).catch(() => {
    throw new Error(`Element "${elementComment}" with selector "${selector}" did not appear in browser view after multiple attempts`);
  });
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

Then('I wait for {string} element in browser view with selector {string}', { timeout: 15000 }, async function(
  this: ApplicationWorld,
  elementComment: string,
  selector: string,
) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  await backOff(
    async () => {
      const exists = await elementExists(this.app!, selector);
      if (!exists) {
        throw new Error(`Element "${elementComment}" with selector "${selector}" not found yet`);
      }
    },
    { ...BACKOFF_OPTIONS, numOfAttempts: 20, startingDelay: 200 },
  ).catch(() => {
    throw new Error(`Element "${elementComment}" with selector "${selector}" did not appear in browser view after multiple attempts`);
  });
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

Then('I should not see a(n) {string} element in browser view with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  await backOff(
    async () => {
      const exists: boolean = await elementExists(this.app!, selector);
      if (exists) {
        throw new Error('Element still exists');
      }
    },
    BACKOFF_OPTIONS,
  ).catch(() => {
    throw new Error(`Element "${elementComment}" with selector "${selector}" was found in browser view after multiple attempts, but should not be visible`);
  });
});

Then('I should see a(n) {string} element in browser view with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  await backOff(
    async () => {
      const exists: boolean = await elementExists(this.app!, selector);
      if (!exists) {
        throw new Error('Element does not exist yet');
      }
    },
    BACKOFF_OPTIONS,
  ).catch(() => {
    throw new Error(`Element "${elementComment}" with selector "${selector}" not found in browser view after multiple attempts`);
  });
});

When('I open tiddler {string} in browser view', async function(this: ApplicationWorld, tiddlerTitle: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  try {
    // Use TiddlyWiki's addToStory API to open the tiddler
    await executeTiddlyWikiCode(this.app, `$tw.wiki.addToStory("${tiddlerTitle.replace(/"/g, '\\"')}")`);
  } catch (error) {
    throw new Error(`Failed to open tiddler "${tiddlerTitle}" in browser view: ${error as Error}`);
  }
});
