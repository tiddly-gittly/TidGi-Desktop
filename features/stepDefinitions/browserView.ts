import { DataTable, Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import { parseDataTableRows } from '../supports/dataTable';
import {
  clickElement,
  clickElementWithText,
  elementExists,
  executeTiddlyWikiCode,
  getDOMContent,
  getTextContent,
  isLoaded,
  pressKey,
  typeText,
} from '../supports/webContentsViewHelper';
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

Then('the browser view should be loaded and visible', async function(this: ApplicationWorld) {
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

When('I click on {string} elements in browser view with selectors:', async function(this: ApplicationWorld, _elementDescriptions: string, dataTable: DataTable) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  const rows = dataTable.raw();
  const dataRows = parseDataTableRows(rows, 2);
  const errors: string[] = [];

  if (dataRows[0]?.length !== 2) {
    throw new Error('Table must have exactly 2 columns: | element description | selector |');
  }

  for (const [elementComment, selector] of dataRows) {
    try {
      const hasTextMatch = selector.match(/^(.+):has-text\(['"](.+)['"]\)$/);

      if (hasTextMatch) {
        const baseSelector = hasTextMatch[1];
        const textContent = hasTextMatch[2];
        await clickElementWithText(this.app, baseSelector, textContent);
      } else {
        await clickElement(this.app, selector);
      }
    } catch (error) {
      errors.push(`Failed to click ${elementComment} element with selector "${selector}" in browser view: ${error as Error}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to click elements in browser view:\n${errors.join('\n')}`);
  }
});

Then('I wait for {string} element in browser view with selector {string}', async function(
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

Then('I should see {string} elements in browser view with selectors:', async function(this: ApplicationWorld, _elementDescriptions: string, dataTable: DataTable) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  if (!this.currentWindow) {
    throw new Error('No current window available');
  }

  const rows = dataTable.raw();
  const dataRows = parseDataTableRows(rows, 2);
  const errors: string[] = [];

  if (dataRows[0]?.length !== 2) {
    throw new Error('Table must have exactly 2 columns: | element description | selector |');
  }

  await Promise.all(dataRows.map(async ([elementComment, selector]) => {
    try {
      await backOff(
        async () => {
          const exists: boolean = await elementExists(this.app!, selector);
          if (!exists) {
            throw new Error('Element does not exist yet');
          }
        },
        BACKOFF_OPTIONS,
      );
    } catch (error) {
      errors.push(`Element "${elementComment}" with selector "${selector}" not found in browser view: ${error as Error}`);
    }
  }));

  if (errors.length > 0) {
    throw new Error(`Failed to find elements in browser view:\n${errors.join('\n')}`);
  }
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

/**
 * Create a new tiddler with title and optional tags via TiddlyWiki UI.
 * This step handles all the UI interactions: click add button, set title, add tags, and confirm.
 */
When('I create a tiddler {string} with tag {string} in browser view', async function(
  this: ApplicationWorld,
  tiddlerTitle: string,
  tagName: string,
) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  // Click add tiddler button
  await clickElement(this.app, 'button:has(.tc-image-new-button)');
  await new Promise(resolve => setTimeout(resolve, 300));

  // Click on title input
  await clickElement(this.app, "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor");
  await new Promise(resolve => setTimeout(resolve, 200));

  // Select all and delete to clear the default title
  await pressKey(this.app, 'Control+a');
  await new Promise(resolve => setTimeout(resolve, 100));
  await pressKey(this.app, 'Delete');
  await new Promise(resolve => setTimeout(resolve, 100));

  // Type the tiddler title
  await typeText(this.app, "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor", tiddlerTitle);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Click on tag input
  await clickElement(this.app, "div[data-tiddler-title^='Draft of'] div.tc-edit-add-tag-ui input.tc-edit-texteditor[placeholder='标签名称']");
  await new Promise(resolve => setTimeout(resolve, 200));

  // Type the tag name
  await typeText(this.app, "div[data-tiddler-title^='Draft of'] div.tc-edit-add-tag-ui input.tc-edit-texteditor[placeholder='标签名称']", tagName);
  await new Promise(resolve => setTimeout(resolve, 200));

  // Click add tag button
  await clickElement(this.app, "div[data-tiddler-title^='Draft of'] span.tc-add-tag-button button");
  await new Promise(resolve => setTimeout(resolve, 300));

  // Click confirm button to save
  await clickElement(this.app, 'button:has(.tc-image-done-button)');
  await new Promise(resolve => setTimeout(resolve, 500));
});

/**
 * Create a new tiddler with title and custom field via TiddlyWiki UI.
 */
When('I create a tiddler {string} with field {string} set to {string} in browser view', async function(
  this: ApplicationWorld,
  tiddlerTitle: string,
  fieldName: string,
  fieldValue: string,
) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  // Click add tiddler button
  await clickElement(this.app, 'button:has(.tc-image-new-button)');
  await new Promise(resolve => setTimeout(resolve, 300));

  // Click on title input
  await clickElement(this.app, "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor");
  await new Promise(resolve => setTimeout(resolve, 200));

  // Select all and delete to clear the default title
  await pressKey(this.app, 'Control+a');
  await new Promise(resolve => setTimeout(resolve, 100));
  await pressKey(this.app, 'Delete');
  await new Promise(resolve => setTimeout(resolve, 100));

  // Type the tiddler title
  await typeText(this.app, "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor", tiddlerTitle);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Add the custom field
  await clickElement(this.app, "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-name-wrapper input");
  await new Promise(resolve => setTimeout(resolve, 200));
  await typeText(this.app, "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-name-wrapper input", fieldName);
  await new Promise(resolve => setTimeout(resolve, 200));

  await clickElement(this.app, "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-value input");
  await new Promise(resolve => setTimeout(resolve, 200));
  await typeText(this.app, "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-value input", fieldValue);
  await new Promise(resolve => setTimeout(resolve, 200));

  await clickElement(this.app, "div[data-tiddler-title^='Draft of'] .tc-edit-field-add button");
  await new Promise(resolve => setTimeout(resolve, 300));

  // Click confirm button to save
  await clickElement(this.app, 'button:has(.tc-image-done-button)');
  await new Promise(resolve => setTimeout(resolve, 500));
});

/**
 * Execute TiddlyWiki code in browser view
 * Useful for programmatic wiki operations
 */
When('I execute TiddlyWiki code in browser view: {string}', async function(this: ApplicationWorld, code: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  try {
    // Wrap the code to avoid returning non-serializable objects
    const wrappedCode = `(function() { ${code}; return true; })()`;
    await executeTiddlyWikiCode(this.app, wrappedCode);
  } catch (error) {
    throw new Error(`Failed to execute TiddlyWiki code in browser view: ${error as Error}`);
  }
});
