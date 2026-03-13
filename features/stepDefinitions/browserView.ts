import { DataTable, Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import { parseDataTableRows } from '../supports/dataTable';
import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
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
  numOfAttempts: 8,
  startingDelay: 200,
  timeMultiple: 1,
  maxDelay: 200,
};

const BROWSER_VIEW_RETRY_DELAY_MS = 100;
/**
 * Each retry iteration takes roughly BROWSER_VIEW_RETRY_DELAY_MS (backoff delay)
 * PLUS the executeInBrowserView timeout (~2000ms worst case for heavy TiddlyWiki pages).
 * Account for both when calculating how many attempts fit within the Cucumber step
 * timeout budget, leaving 4s margin for catch-block diagnostics and Cucumber overhead.
 */
const ESTIMATED_PER_ATTEMPT_MS = BROWSER_VIEW_RETRY_DELAY_MS + 2000; // delay + executeJavaScript timeout
const BROWSER_VIEW_RETRY_ATTEMPTS = Math.max(
  8,
  Math.floor((CUCUMBER_GLOBAL_TIMEOUT - 4000) / ESTIMATED_PER_ATTEMPT_MS),
);

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
      const content = await getTextContent(this.app!);
      if (!content || content.trim().length === 0) {
        throw new Error('Browser view content not available yet');
      }
    },
    {
      ...BACKOFF_OPTIONS,
      numOfAttempts: BROWSER_VIEW_RETRY_ATTEMPTS,
      startingDelay: BROWSER_VIEW_RETRY_DELAY_MS,
      maxDelay: BROWSER_VIEW_RETRY_DELAY_MS,
    },
  ).catch(async () => {
    // Gather diagnostics for failure analysis
    let diagnostics = '';
    try {
      const loaded = await isLoaded(this.app!);
      const content = await getTextContent(this.app!);
      diagnostics = `isLoaded=${loaded}, textContent=${content ? `"${content.substring(0, 100)}..."` : 'null'}`;
    } catch (diagError) {
      diagnostics = `diagnostics failed: ${String(diagError)}`;
    }
    throw new Error(
      `Browser view is not loaded or visible after ${BROWSER_VIEW_RETRY_ATTEMPTS} attempts ` +
        `(~${Math.round((BROWSER_VIEW_RETRY_ATTEMPTS * ESTIMATED_PER_ATTEMPT_MS) / 1000)}s / ${Math.round(CUCUMBER_GLOBAL_TIMEOUT / 1000)}s budget). ${diagnostics}`,
    );
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

  /**
   * Use flat 200 ms retries instead of exponential back-off.
   * During a wiki restart, executeTiddlyWikiCode hangs for ~200 ms per attempt
   * (webContents navigating), then needs a delay before the next try.
   * Flat 200 ms gives ~12 attempts in the 5 s Cucumber step budget, which is
   * enough to bridge the gap when the wiki becomes ready late into the step.
   */
  await backOff(
    async () => {
      await executeTiddlyWikiCode(
        this.app!,
        `(function() {
          const title = "${tiddlerTitle.replace(/"/g, '\\"')}";
          try { if ($tw?.wiki?.removeFromStory) $tw.wiki.removeFromStory(title); } catch {}
          $tw.wiki.addToStory(title);
          return true;
        })()`,
      );
    },
    { ...BACKOFF_OPTIONS, numOfAttempts: 8, startingDelay: 200, timeMultiple: 1, maxDelay: 200 },
  ).catch((error: unknown) => {
    throw new Error(`Failed to open tiddler "${tiddlerTitle}" in browser view: ${error as Error}`);
  });
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

  // Use TiddlyWiki API directly — the DOM-based approach (typeText / pressKey)
  // doesn't reliably trigger TW5's custom input handling for the title editor.
  const script = `(function() {
    var now = $tw.utils.stringifyDate(new Date());
    $tw.wiki.addTiddler(new $tw.Tiddler({
      title: ${JSON.stringify(tiddlerTitle)},
      tags: ${JSON.stringify(tagName)},
      text: '',
      type: 'text/vnd.tiddlywiki',
      created: now,
      modified: now
    }));
    return true;
  })()`;
  await executeTiddlyWikiCode(this.app, script);
  // Give syncer time to pick up the change and write to disk
  await new Promise(resolve => setTimeout(resolve, 1500));
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

  // Use TiddlyWiki API directly for reliability.
  const script = `(function() {
    var now = $tw.utils.stringifyDate(new Date());
    var fields = {
      title: ${JSON.stringify(tiddlerTitle)},
      text: '',
      type: 'text/vnd.tiddlywiki',
      created: now,
      modified: now
    };
    fields[${JSON.stringify(fieldName)}] = ${JSON.stringify(fieldValue)};
    $tw.wiki.addTiddler(new $tw.Tiddler(fields));
    return true;
  })()`;
  await executeTiddlyWikiCode(this.app, script);
  // Give syncer time to pick up the change and write to disk
  await new Promise(resolve => setTimeout(resolve, 1500));
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

Then('image {string} should be loaded in browser view', async function(this: ApplicationWorld, imageName: string) {
  if (!this.app) {
    throw new Error('Application not launched');
  }

  const tiddlerTitle = imageName;
  let lastDiagnostic = '';
  await backOff(
    async () => {
      let isImageLoaded = false;
      try {
        const diagnostic = await executeTiddlyWikiCode<{
          loaded: boolean;
          hasContainer: boolean;
          hasImage: boolean;
          src: string;
          complete: boolean;
          naturalWidth: number;
          naturalHeight: number;
          canonicalUri: string;
        }>(
          this.app!,
          `(function() {
              const title = ${JSON.stringify(tiddlerTitle)};
              const container = document.querySelector("[data-tiddler-title='" + title.replace(/'/g, "\\'") + "']");
              if (!container) {
                try { if (typeof $tw !== 'undefined' && $tw.wiki) $tw.wiki.addToStory(title); } catch {}
                return {
                  loaded: false,
                  hasContainer: false,
                  hasImage: false,
                  src: '',
                  complete: false,
                  naturalWidth: 0,
                  naturalHeight: 0,
                  canonicalUri: (typeof $tw !== 'undefined' && $tw.wiki && $tw.wiki.getTiddler(title)?.fields?._canonical_uri) || '',
                };
              }
              const image = container.querySelector('img');
              if (!image) {
                return {
                  loaded: false,
                  hasContainer: true,
                  hasImage: false,
                  src: '',
                  complete: false,
                  naturalWidth: 0,
                  naturalHeight: 0,
                  canonicalUri: (typeof $tw !== 'undefined' && $tw.wiki && $tw.wiki.getTiddler(title)?.fields?._canonical_uri) || '',
                };
              }
              return {
                loaded: Boolean(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
                hasContainer: true,
                hasImage: true,
                src: image.currentSrc || image.src || '',
                complete: Boolean(image.complete),
                naturalWidth: Number(image.naturalWidth || 0),
                naturalHeight: Number(image.naturalHeight || 0),
                canonicalUri: (typeof $tw !== 'undefined' && $tw.wiki && $tw.wiki.getTiddler(title)?.fields?._canonical_uri) || '',
              };
            })()`,
          200,
        );
        lastDiagnostic = JSON.stringify(diagnostic);
        isImageLoaded = Boolean(diagnostic?.loaded);
      } catch {
        isImageLoaded = false;
      }

      if (!isImageLoaded) {
        throw new Error(`Image ${imageName} is not loaded yet`);
      }
    },
    { numOfAttempts: 100, startingDelay: 150, timeMultiple: 1, maxDelay: 150 },
  ).catch(() => {
    throw new Error(`Image ${imageName} is not loaded correctly in browser view. Last diagnostic: ${lastDiagnostic}`);
  });
});
