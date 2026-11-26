import { After, DataTable, Given, Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CDPSession, Locator } from 'playwright';
import { parseDataTableRows } from '../supports/dataTable';
import { getWikiTestRootPath } from '../supports/paths';
import { CUCUMBER_GLOBAL_TIMEOUT, PLAYWRIGHT_SHORT_TIMEOUT } from '../supports/timeouts';
import type { ApplicationWorld } from './application';

const UI_ACTION_TIMEOUT = Math.max(1000, CUCUMBER_GLOBAL_TIMEOUT - 1000);
const UI_ASSERT_TIMEOUT = Math.max(1000, CUCUMBER_GLOBAL_TIMEOUT - 5000);

const elementSnapshots = new WeakMap<ApplicationWorld, Map<string, { text: string | null; attribute: string | null }[]>>();
const originalClipboards = new WeakMap<ApplicationWorld, string>();
const touchSessions = new WeakMap<ApplicationWorld, CDPSession>();

Then(
  'the window property {string} should be unset in the host and frame {string} after rendering {string}',
  async function(this: ApplicationWorld, property: string, selector: string, contentSelector: string) {
    assert(this.currentWindow);
    const snapshot = await this.currentWindow.waitForFunction(
      ({ property, selector, contentSelector }) => {
        const frame = document.querySelector<HTMLIFrameElement>(selector);
        if (!frame?.contentWindow || !frame.contentDocument?.querySelector(contentSelector)) return false;
        return { hostUnset: Reflect.get(window, property) === undefined, frameUnset: Reflect.get(frame.contentWindow, property) === undefined };
      },
      { property, selector, contentSelector },
      { timeout: CUCUMBER_GLOBAL_TIMEOUT },
    );
    try {
      assert.deepEqual(await snapshot.jsonValue(), { hostUnset: true, frameUnset: true });
    } finally {
      await snapshot.dispose();
    }
  },
);

Then(/^I should (see|no longer see) "([^"]+)" text in "([^"]+)" or its frames$/, async function(
  this: ApplicationWorld,
  expectation: string,
  text: string,
  selector: string,
) {
  assert(this.currentWindow);
  const roots = this.currentWindow.locator(selector);
  const expected = expectation === 'see';
  await backOff(async () => {
    const hostVisible = await roots.filter({ hasText: text }).first().isVisible();
    const frameVisible = hostVisible || await roots.locator('iframe').evaluateAll((frames, value) =>
      frames.some(frame => {
        if (!(frame instanceof HTMLIFrameElement)) return false;
        const box = frame.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && frame.contentDocument?.body?.innerText.includes(value);
      }), text);
    assert.equal(frameVisible, expected, `Expected to ${expectation} “${text}” in ${selector}`);
  }, { numOfAttempts: Math.ceil(UI_ASSERT_TIMEOUT / 100), startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
});

Given('I clear the clipboard', async function(this: ApplicationWorld) {
  assert(this.app);
  if (!originalClipboards.has(this)) originalClipboards.set(this, await this.app.evaluate(({ clipboard }) => clipboard.readText()));
  await this.app.evaluate(({ clipboard }) => {
    clipboard.clear();
  });
});

Then('the clipboard should contain exactly {string}', async function(this: ApplicationWorld, expected: string) {
  assert(this.app);
  await backOff(async () => {
    const actual = await this.app!.evaluate(({ clipboard }) => clipboard.readText());
    assert(actual === expected, `Clipboard differs from expected text; actual length=${actual.length}`);
  }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
});

When('I use a touch viewport of {int} by {int}', async function(this: ApplicationWorld, width: number, height: number) {
  assert(this.currentWindow);
  const session = await this.currentWindow.context().newCDPSession(this.currentWindow);
  touchSessions.set(this, session);
  await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await this.currentWindow.waitForFunction(() => window.matchMedia('(hover: none)').matches, undefined, { timeout: CUCUMBER_GLOBAL_TIMEOUT });
});

When('I tap on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, _description: string, selector: string) {
  assert(this.currentWindow);
  const session = touchSessions.get(this);
  assert(session, 'Enable a touch viewport before tapping');
  const element = this.currentWindow.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  assert(box);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

After(async function(this: ApplicationWorld) {
  const session = touchSessions.get(this);
  try {
    if (session) {
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await session.send('Emulation.clearDeviceMetricsOverride');
      await session.detach();
    }
  } finally {
    const original = originalClipboards.get(this);
    if (original !== undefined && this.app) {
      await this.app.evaluate(({ clipboard }, text) => {
        clipboard.writeText(text);
      }, original);
    }
  }
});

async function assertComputedStyle(element: Locator, property: string, expected: string): Promise<void> {
  await element.waitFor({ state: 'visible', timeout: UI_ASSERT_TIMEOUT });
  await backOff(async () => {
    assert.equal(await element.evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property), expected, property);
  }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
}

Then('the element with selector {string} should be at most {int} pixels high', async function(this: ApplicationWorld, selector: string, maximum: number) {
  assert(this.currentWindow);
  await backOff(async () => {
    const box = await this.currentWindow!.locator(selector).first().boundingBox();
    assert(box && box.height <= maximum, 'Element exceeds its height bound');
  }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
});

Then('the element with selector {string} should lie inside viewport {string}', async function(this: ApplicationWorld, selector: string, viewport: string) {
  assert(this.currentWindow);
  await backOff(async () => {
    const box = await this.currentWindow!.locator(selector).first().boundingBox();
    const bounds = await this.currentWindow!.locator(viewport).first().boundingBox();
    assert(box && bounds && box.y >= bounds.y - 2 && box.y < bounds.y + bounds.height, 'Element is outside its viewport');
  }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
});

Then(
  'the {string} pseudo-element of {string} should have {string} matching the {string} of {string}',
  async function(this: ApplicationWorld, pseudo: string, selector: string, property: string, referenceProperty: string, reference: string) {
    assert(this.currentWindow);
    await backOff(async () => {
      const actual = await this.currentWindow!.locator(selector).first().evaluate((node, { pseudo, property }) => getComputedStyle(node, pseudo).getPropertyValue(property), {
        pseudo,
        property,
      });
      const expected = await this.currentWindow!.locator(reference).first().evaluate((node, property) => getComputedStyle(node).getPropertyValue(property), referenceProperty);
      assert.equal(actual, expected);
    }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
  },
);

When('I focus on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, _description: string, selector: string) {
  assert(this.currentWindow);
  await this.currentWindow.locator(selector).first().focus({ timeout: UI_ACTION_TIMEOUT });
});

When('I scroll a(n) {string} element with selector {string} to the top', async function(this: ApplicationWorld, _description: string, selector: string) {
  assert(this.currentWindow);
  await this.currentWindow.locator(selector).first().evaluate(element => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
});

When(
  'I click on a(n) {string} element with selector {string} whose {string} matches the {string} of {string}',
  async function(this: ApplicationWorld, _description: string, selector: string, attribute: string, sourceAttribute: string, sourceSelector: string) {
    assert(this.currentWindow);
    const value = await this.currentWindow.locator(sourceSelector).first().getAttribute(sourceAttribute);
    assert(value, `Missing ${sourceAttribute} on ${sourceSelector}`);
    await this.currentWindow.locator(`${selector}[${attribute}=${JSON.stringify(value)}]`).click({ timeout: UI_ACTION_TIMEOUT });
  },
);

When(
  'I remember the text and {string} attribute of elements with selector {string} as {string}',
  async function(this: ApplicationWorld, attribute: string, selector: string, name: string) {
    assert(this.currentWindow);
    const elements = this.currentWindow.locator(selector);
    await elements.first().waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });
    const snapshots = elementSnapshots.get(this) ?? new Map<string, { text: string | null; attribute: string | null }[]>();
    snapshots.set(
      name,
      await elements.evaluateAll((nodes, attributeName) => nodes.map(node => ({ text: node.textContent, attribute: node.getAttribute(attributeName) })), attribute),
    );
    elementSnapshots.set(this, snapshots);
  },
);

Then(
  'the text and {string} attribute of elements with selector {string} should match {string}',
  async function(this: ApplicationWorld, attribute: string, selector: string, name: string) {
    assert(this.currentWindow);
    const expected = elementSnapshots.get(this)?.get(name);
    assert(expected, `No saved element snapshot named ${name}`);
    await backOff(async () => {
      const actual = await this.currentWindow!.locator(selector).evaluateAll(
        (nodes, attributeName) => nodes.map(node => ({ text: node.textContent, attribute: node.getAttribute(attributeName) })),
        attribute,
      );
      assert.deepEqual(actual, expected);
    }, { numOfAttempts: 30, startingDelay: 100, maxDelay: 1000 });
  },
);

Then(
  'the paginated JSON in {string} with next button {string} should contain these texts and exclude {string}:',
  async function(this: ApplicationWorld, selector: string, nextSelector: string, excluded: string, expectedTexts: DataTable) {
    assert(this.currentWindow);
    const page = this.currentWindow;
    let content = '';
    const seen = new Set<string>();
    while (true) {
      const text = page.locator(selector);
      await text.waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });
      const chunk = await text.textContent();
      assert(chunk, 'JSON page is empty');
      assert(!seen.has(chunk), 'Pagination repeated a page');
      seen.add(chunk);
      content += chunk;
      const next = page.locator(nextSelector);
      if (await next.count() === 0) break;
      assert(seen.size < 128, 'JSON detail exceeded its bounded 128-page ceiling');
      await next.click({ timeout: UI_ACTION_TIMEOUT });
      await backOff(async () => {
        const nextChunk = await text.textContent();
        assert(nextChunk && nextChunk !== chunk, 'The next page has not loaded');
      }, { numOfAttempts: 30, startingDelay: 100, maxDelay: 1000 });
    }
    JSON.parse(content);
    for (const [expected] of expectedTexts.raw()) assert(content.includes(expected), `JSON does not contain ${expected}`);
    assert(!content.includes(excluded), `JSON unexpectedly contains ${excluded}`);
  },
);

Then(
  'there should be between {int} and {int} elements matching {string} with distinct {string} attributes',
  async function(this: ApplicationWorld, minimum: number, maximum: number, selector: string, attribute: string) {
    assert(this.currentWindow);
    await backOff(async () => {
      const values = await this.currentWindow!.locator(selector).evaluateAll((nodes, name) => nodes.map(node => node.getAttribute(name)), attribute);
      assert(values.length >= minimum && values.length <= maximum, `${selector}: expected ${minimum}-${maximum} elements, received ${values.length}`);
      assert(values.every(value => value), `${attribute}: missing element identity`);
      assert.equal(new Set(values).size, values.length, `${attribute}: duplicated element identities`);
    }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
  },
);

Then(
  'the text and {string} attribute of elements with selector {string} should not match {string}',
  async function(this: ApplicationWorld, attribute: string, selector: string, name: string) {
    assert(this.currentWindow);
    const expected = elementSnapshots.get(this)?.get(name);
    assert(expected, `No saved element snapshot named ${name}`);
    await backOff(async () => {
      const actual = await this.currentWindow!.locator(selector).evaluateAll(
        (nodes, name) => nodes.map(node => ({ text: node.textContent, attribute: node.getAttribute(name) })),
        attribute,
      );
      assert(actual.length > 0, 'The replacement elements have not rendered');
      assert.notDeepEqual(actual, expected);
    }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
  },
);

Then('I capture the current window as {string}', async function(this: ApplicationWorld, name: string) {
  if (!this.app || !this.currentWindow) throw new Error('No current window is available');
  await this.currentWindow.screenshot({ path: path.resolve('test-artifacts', this.scenarioSlug, name) });
});

When('I hover on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, _description: string, selector: string) {
  if (!this.currentWindow) throw new Error('No current window is available');
  await this.currentWindow.locator(selector).first().hover({ timeout: UI_ACTION_TIMEOUT });
});

When('I reload the current window', async function(this: ApplicationWorld) {
  if (!this.currentWindow) throw new Error('No current window is available');
  await this.currentWindow.reload({ timeout: UI_ACTION_TIMEOUT });
});

When('I type fixture {string} in {string} element with selector {string}', async function(this: ApplicationWorld, file: string, _description: string, selector: string) {
  if (!this.currentWindow) throw new Error('No current window is available');
  await this.currentWindow.locator(selector).fill(await readFile(path.resolve('features/fixtures', file), 'utf8'), { timeout: UI_ACTION_TIMEOUT });
});

Then('the {string} element with selector {string} should have value {string}', async function(this: ApplicationWorld, description: string, selector: string, expected: string) {
  if (!this.currentWindow) throw new Error('No current window is available');
  try {
    await this.currentWindow.waitForFunction(
      ({ selector, expected }) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value === expected,
      { selector, expected },
      { timeout: CUCUMBER_GLOBAL_TIMEOUT },
    );
  } catch (error) {
    throw new Error(`${description}: expected value ${JSON.stringify(expected)}`, { cause: error });
  }
});

Then('I should see a(n) {string} element with selector {string} in frame {string}', async function(this: ApplicationWorld, _description: string, selector: string, frame: string) {
  if (!this.currentWindow) throw new Error('No current window is available');
  await this.currentWindow.frameLocator(frame).locator(selector).first().waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });
});

Then(
  'I should see a(n) {string} element with selector {string} with CSS property {string} equal to {string}',
  async function(this: ApplicationWorld, _description: string, selector: string, property: string, expected: string) {
    assert(this.currentWindow);
    await assertComputedStyle(this.currentWindow.locator(selector).first(), property, expected);
  },
);

Then(
  'I should see a(n) {string} element with selector {string} in frame {string} with CSS property {string} equal to {string}',
  async function(this: ApplicationWorld, _description: string, selector: string, frame: string, property: string, expected: string) {
    assert(this.currentWindow);
    await assertComputedStyle(this.currentWindow.frameLocator(frame).locator(selector).first(), property, expected);
  },
);

async function getWindowSummary(page: NonNullable<ApplicationWorld['currentWindow']>): Promise<string> {
  try {
    const [title, meta] = await Promise.all([
      page.title(),
      page.evaluate(() => window.meta?.()),
    ]);
    return JSON.stringify({ url: page.url(), title, meta });
  } catch (error) {
    return JSON.stringify({ url: page.url(), diagnosticError: String(error) });
  }
}

async function getControlSummaryForSelectorFailure(
  page: NonNullable<ApplicationWorld['currentWindow']>,
  selector: string,
): Promise<string> {
  const containerMatch = selector.match(/^(?<container>\[data-testid='[^']+'\])/);
  const containerSelector = containerMatch?.groups?.container ?? 'body';

  try {
    return await page.evaluate((rootSelector) => {
      const root = document.querySelector(rootSelector) ?? document.body;
      const controls = Array.from(root.querySelectorAll('input, textarea, button, [role="tab"], [role="tabpanel"]')).slice(0, 80);
      return controls.map((element) => {
        const htmlElement = element as HTMLElement;
        const inputElement = element as HTMLInputElement | HTMLTextAreaElement;
        return [
          element.tagName.toLowerCase(),
          htmlElement.getAttribute('role') ? `role=${htmlElement.getAttribute('role')}` : '',
          htmlElement.id ? `id=${htmlElement.id}` : '',
          htmlElement.getAttribute('data-testid') ? `testid=${htmlElement.getAttribute('data-testid')}` : '',
          htmlElement.getAttribute('aria-label') ? `aria=${htmlElement.getAttribute('aria-label')}` : '',
          inputElement.type ? `type=${inputElement.type}` : '',
          inputElement.name ? `name=${inputElement.name}` : '',
          htmlElement.textContent?.trim() ? `text=${htmlElement.textContent.trim().slice(0, 40)}` : '',
        ].filter(Boolean).join(' ');
      }).join('\n');
    }, containerSelector);
  } catch (error) {
    return `Could not summarize controls: ${error as Error}`;
  }
}

When('I wait for {float} seconds', async function(seconds: number) {
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
});

/**
 * Wait with a reason for documentation and debugging
 * The reason parameter is used in the Gherkin feature file for documentation purposes
 */
When('I wait for {float} seconds for {string}', async function(seconds: number, _reason: string) {
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
});

When('I wait for the page to load completely', async function(this: ApplicationWorld) {
  if (this.appLaunchPromise) {
    try {
      await this.appLaunchPromise;
    } catch (error) {
      throw new Error(
        `Failed to launch TidGi application: ${error as Error}. You should run \`pnpm run test:prepare-e2e\` before running the tests to ensure the app is built, and build with binaries like "dugite" and "tiddlywiki", see scripts/afterPack.js for more details.`,
      );
    } finally {
      this.appLaunchPromise = undefined;
    }
  }

  let currentWindow = this.currentWindow;
  if ((!currentWindow || currentWindow.isClosed()) && this.app) {
    currentWindow = await this.app.firstWindow({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
    this.mainWindow = this.mainWindow ?? currentWindow;
    this.currentWindow = currentWindow;
  }
  await currentWindow?.waitForLoadState('domcontentloaded', { timeout: CUCUMBER_GLOBAL_TIMEOUT });
  // Short grace period for network idle during startup. Fails silently — DOM is ready.
  try {
    await currentWindow?.waitForLoadState('networkidle', { timeout: CUCUMBER_GLOBAL_TIMEOUT });
  } catch {
    // Ignore – DOM is already ready.
  }
});

Then('I should see a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  let currentWindow = this.currentWindow;
  if ((!currentWindow || currentWindow.isClosed()) && this.app) {
    currentWindow = await this.app.firstWindow({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
    this.mainWindow = this.mainWindow ?? currentWindow;
    this.currentWindow = currentWindow;
  }
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.locator(selector).first().waitFor({ state: 'visible', timeout: UI_ASSERT_TIMEOUT });
  } catch (error) {
    const controlSummary = await getControlSummaryForSelectorFailure(currentWindow, selector);
    throw new Error(`Failed to find ${elementComment} with selector "${selector}": ${error as Error}\nVisible controls near target:\n${controlSummary}`);
  }
});

Then('the {string} element with selector {string} should be aligned near the top of its scroll viewport', async function(
  this: ApplicationWorld,
  elementComment: string,
  selector: string,
) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) throw new Error('No current window is available');
  const element = currentWindow.locator(selector).first();
  await element.waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });

  await backOff(async () => {
    const alignment = await element.evaluate((node) => {
      const scrollViewport = node.closest('[data-settings-scroll-viewport], [role="list"]');
      if (!scrollViewport) throw new Error('Settings scroll viewport was not found');
      const nodeRectangle = node.getBoundingClientRect();
      const viewportRectangle = scrollViewport.getBoundingClientRect();
      return {
        offsetFromViewportTop: nodeRectangle.top - viewportRectangle.top,
        scrollTop: scrollViewport.scrollTop,
        viewportHeight: viewportRectangle.height,
      };
    });
    if (Math.abs(alignment.offsetFromViewportTop) > 32) {
      throw new Error(
        `${elementComment} is ${alignment.offsetFromViewportTop}px from the viewport top ` +
          `(viewport height ${alignment.viewportHeight}px, scrollTop ${alignment.scrollTop}px)`,
      );
    }
  }, {
    delayFirstAttempt: true,
    jitter: 'none',
    maxDelay: 500,
    numOfAttempts: 10,
    startingDelay: 100,
    timeMultiple: 1.3,
  });
});

Then('I should see {string} elements with selectors:', async function(this: ApplicationWorld, _elementDescriptions: string, dataTable: DataTable) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const rows = dataTable.raw();
  const dataRows = parseDataTableRows(rows, 2);
  const errors: string[] = [];
  if (dataRows[0]?.length !== 2) {
    throw new Error('Table must have exactly 2 columns: | element description | selector |');
  }

  // Check all elements in parallel for better performance
  await Promise.all(dataRows.map(async ([elementComment, selector]) => {
    try {
      await currentWindow.waitForSelector(selector, { timeout: CUCUMBER_GLOBAL_TIMEOUT });
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
    // Wait for element to be hidden/detached (handles race conditions after state changes)
    await element.waitFor({ state: 'hidden', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      // Element still visible after timeout — get parent HTML for debugging
      let parentHtml: string;
      try {
        const element = currentWindow.locator(selector).first();
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
    throw error;
  }
});

Then('I should not see {string} elements with selectors:', async function(this: ApplicationWorld, _elementDescriptions: string, dataTable: DataTable) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const rows = dataTable.raw();
  const dataRows = parseDataTableRows(rows, 2);

  if (dataRows[0]?.length !== 2) {
    throw new Error('Table must have exactly 2 columns: | element description | selector |');
  }

  await Promise.all(dataRows.map(async ([elementComment, selector]) => {
    try {
      await currentWindow.locator(selector).first().waitFor({ state: 'hidden', timeout: CUCUMBER_GLOBAL_TIMEOUT });
    } catch (error) {
      throw new Error(`Failed to verify "${elementComment}" with selector "${selector}" is hidden`, { cause: error });
    }
  }));
});

When('I click on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const targetWindow = await this.getWindow('current');

  if (!targetWindow) {
    throw new Error(`Window "current" is not available`);
  }

  try {
    await targetWindow.waitForSelector(selector, { timeout: UI_ACTION_TIMEOUT });
    const isVisible = await targetWindow.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is not visible`);
    }
    await targetWindow.click(selector);
  } catch (error) {
    const controlSummary = await getControlSummaryForSelectorFailure(targetWindow, selector);
    throw new Error(
      `Failed to find and click ${elementComment} with selector "${selector}" in current window: ${error as Error}\nVisible controls near target:\n${controlSummary}`,
    );
  }
});

Then('the {string} element with selector {string} should be unchecked', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const targetWindow = await this.getWindow('current');

  if (!targetWindow) {
    throw new Error(`Window "current" is not available`);
  }

  try {
    const locator = targetWindow.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });
    const isChecked = await locator.isChecked();
    if (isChecked) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is checked, expected unchecked`);
    }
  } catch (error) {
    throw new Error(`Failed to verify ${elementComment} with selector "${selector}" is unchecked: ${error as Error}`);
  }
});

When('I click on {string} elements with selectors:', async function(this: ApplicationWorld, _elementDescriptions: string, dataTable: DataTable) {
  const targetWindow = await this.getWindow('current');

  if (!targetWindow) {
    throw new Error('Window "current" is not available');
  }

  const rows = dataTable.raw();
  const dataRows = parseDataTableRows(rows, 2);

  if (dataRows[0]?.length !== 2) {
    throw new Error('Table must have exactly 2 columns: | element description | selector |');
  }

  // Click elements sequentially (not in parallel) to maintain order and avoid race conditions
  for (const [elementComment, selector] of dataRows) {
    try {
      await targetWindow.waitForSelector(selector, { timeout: PLAYWRIGHT_SHORT_TIMEOUT });
      const isVisible = await targetWindow.isVisible(selector);
      if (!isVisible) {
        throw new Error(`Element is not visible`);
      }
      await targetWindow.click(selector);
    } catch (error) {
      const [windowSummary, controlSummary] = await Promise.all([
        getWindowSummary(targetWindow),
        getControlSummaryForSelectorFailure(targetWindow, selector),
      ]);
      throw new Error(
        `Failed to find and click "${elementComment}" with selector "${selector}": ${error as Error}\n` +
          `Current window: ${windowSummary}\nVisible controls near target:\n${controlSummary}`,
      );
    }
  }
});

When('I ctrl-click on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const targetWindow = await this.getWindow('current');
  if (!targetWindow) {
    throw new Error(`Window "current" is not available`);
  }
  try {
    await targetWindow.waitForSelector(selector, { timeout: CUCUMBER_GLOBAL_TIMEOUT });
    const isVisible = await targetWindow.isVisible(selector);
    if (!isVisible) {
      throw new Error(`Element "${elementComment}" with selector "${selector}" is not visible`);
    }
    await targetWindow.click(selector, { modifiers: ['Control'] });
  } catch (error) {
    throw new Error(`Failed to ctrl-click ${elementComment} with selector "${selector}": ${error as Error}`);
  }
});

When('I right-click on a(n) {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const targetWindow = await this.getWindow('current');

  if (!targetWindow) {
    throw new Error(`Window "current" is not available`);
  }

  try {
    await targetWindow.waitForSelector(selector, { timeout: CUCUMBER_GLOBAL_TIMEOUT });
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

  // Wait for at least one element to appear in DOM (even if hidden)
  try {
    await win.locator(selector).first().waitFor({ state: 'attached', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  } catch {
    throw new Error(`No elements found for ${elementComment} with selector "${selector}" within timeout`);
  }

  const locator = win.locator(selector);
  const count = await locator.count();

  // Single-pass reverse iteration to avoid index shift issues
  for (let index = count - 1; index >= 0; index--) {
    try {
      await locator.nth(index).scrollIntoViewIfNeeded().catch(() => {});
      await locator.nth(index).click({ force: true, timeout: CUCUMBER_GLOBAL_TIMEOUT });
      // Brief pause for the UI to settle after each close
      await new Promise(resolve => setTimeout(resolve, 300));
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

  const actualText = text.replace('{tmpDir}', getWikiTestRootPath(this));

  try {
    await currentWindow.waitForSelector(selector, { timeout: CUCUMBER_GLOBAL_TIMEOUT });
    const element = currentWindow.locator(selector);
    await element.fill(actualText);
    const value = await element.inputValue();
    if (value !== actualText) {
      throw new Error(`Expected value "${actualText}" after fill, got "${value}"`);
    }
  } catch (error) {
    throw new Error(`Failed to type in ${elementComment} element with selector "${selector}": ${error as Error}`);
  }
});

When('I type in {string} elements with selectors:', async function(this: ApplicationWorld, elementDescriptions: string, dataTable: DataTable) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const descriptions = elementDescriptions.split(' and ').map(d => d.trim());
  const rows = dataTable.raw();
  const dataRows = parseDataTableRows(rows, 2);
  const errors: string[] = [];

  if (descriptions.length !== dataRows.length) {
    throw new Error(`Mismatch: ${descriptions.length} element descriptions but ${dataRows.length} text/selector pairs provided`);
  }

  // Type in elements sequentially to maintain order
  for (let index = 0; index < dataRows.length; index++) {
    const [text, selector] = dataRows[index];
    const elementComment = descriptions[index];

    // Replace {tmpDir} placeholder with actual test root path
    const actualText = text.replace('{tmpDir}', getWikiTestRootPath(this));

    try {
      await currentWindow.waitForSelector(selector, { timeout: CUCUMBER_GLOBAL_TIMEOUT });
      const element = currentWindow.locator(selector);
      await element.fill(actualText);
    } catch (error) {
      errors.push(`Failed to type in "${elementComment}" with selector "${selector}": ${error as Error}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to type in some elements:\n${errors.join('\n')}`);
  }
});

When('I clear text in {string} element with selector {string}', async function(this: ApplicationWorld, elementComment: string, selector: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.waitForSelector(selector, { timeout: CUCUMBER_GLOBAL_TIMEOUT });
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

  // Dispatch to the focused control when possible. This preserves the generic
  // step's semantics without coupling it to a specific component library.
  const focusedControl = currentWindow.locator(':focus').first();
  if (await focusedControl.count() > 0) {
    await focusedControl.press(key);
    return;
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

// Switch to the newest/latest window (useful for OAuth popups)
When('I switch to the newest window', async function(this: ApplicationWorld) {
  if (!this.app) {
    throw new Error('Application is not available');
  }
  const allWindows = this.app.windows().filter(p => !p.isClosed());
  if (allWindows.length === 0) {
    throw new Error('No windows available');
  }
  // The newest window is the last one in the array
  const newestWindow = allWindows[allWindows.length - 1];
  this.currentWindow = newestWindow;
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
    // Prefer explicit platform detection: use 'Meta' only on macOS (darwin),
    // otherwise default to 'Control'. This avoids assuming non-Windows/Linux
    // is always macOS.
    if (process.platform === 'darwin') {
      platformKeyCombo = keyCombo.replace('CommandOrControl', 'Meta');
    } else {
      platformKeyCombo = keyCombo.replace('CommandOrControl', 'Control');
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
    // Find the element with the test-id (could be input directly, or a wrapper div for MUI TextField)
    const directInputSelector = `input[data-testid="${testId}"]`;
    const wrapperSelector = `[data-testid="${testId}"]`;

    // Try input first, then fall back to wrapper
    const hasDirectInput = await currentWindow.locator(directInputSelector).count() > 0;
    const containerSelector = hasDirectInput ? directInputSelector : wrapperSelector;
    await currentWindow.waitForSelector(containerSelector, { timeout: PLAYWRIGHT_SHORT_TIMEOUT });

    // Click the combobox to open the dropdown
    const clicked = await currentWindow.evaluate((testId) => {
      // Try direct input match first
      const element: Element | null = document.querySelector(`input[data-testid="${testId}"]`);
      let searchRoot: Element | null = element?.parentElement ?? null;

      // If not found, try wrapper element (MUI TextField with select prop)
      if (!element) {
        searchRoot = document.querySelector(`[data-testid="${testId}"]`);
      }

      if (!searchRoot) return { success: false, error: 'Element not found' };

      const combobox = searchRoot.querySelector('[role="combobox"]');
      if (!combobox) {
        return {
          success: false,
          error: 'Combobox not found',
          parentHTML: searchRoot.outerHTML.substring(0, 500),
        };
      }

      combobox.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      combobox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      (combobox as HTMLElement).click();

      return { success: true };
    }, testId);

    if (!clicked.success) {
      throw new Error(`Failed to click: ${JSON.stringify(clicked)}`);
    }

    // Wait for the menu to appear
    await currentWindow.waitForSelector('[role="listbox"]', { state: 'visible', timeout: PLAYWRIGHT_SHORT_TIMEOUT });

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
    await currentWindow.waitForSelector('[role="listbox"]', { state: 'hidden', timeout: PLAYWRIGHT_SHORT_TIMEOUT });
  } catch (error) {
    throw new Error(`Failed to select option "${optionValue}" from MUI Select with test id "${testId}": ${String(error)}`);
  }
});

// Debug step to print current DOM structure
When('I print current DOM structure', async function(this: ApplicationWorld) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const html = await currentWindow.evaluate(() => {
    return document.body.innerHTML;
  });

  console.log('=== Current DOM Structure ===');
  console.log(html.substring(0, 5000)); // Print first 5000 characters
  console.log('=== End DOM Structure ===');
});

// Debug step to print DOM structure of a specific element
When('I print DOM structure of element with selector {string}', async function(this: ApplicationWorld, selector: string) {
  const currentWindow = this.currentWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  try {
    await currentWindow.waitForSelector(selector, { timeout: CUCUMBER_GLOBAL_TIMEOUT });

    const elementInfo = await currentWindow.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { found: false };
      }

      return {
        found: true,
        outerHTML: element.outerHTML,
        innerHTML: element.innerHTML,
        attributes: Array.from(element.attributes).map(attribute => ({
          name: attribute.name,
          value: attribute.value,
        })),
        children: Array.from(element.children).map(child => ({
          tagName: child.tagName,
          className: child.className,
          id: child.id,
          attributes: Array.from(child.attributes).map(attribute => ({
            name: attribute.name,
            value: attribute.value,
          })),
        })),
      };
    }, selector);

    if (!elementInfo.found) {
      console.log(`=== Element "${selector}" not found ===`);
      return;
    }

    console.log(`=== DOM Structure of "${selector}" ===`);
    console.log('Attributes:', JSON.stringify(elementInfo.attributes, null, 2));
    console.log('\nChildren:', JSON.stringify(elementInfo.children, null, 2));
    console.log('\nOuter HTML (first 2000 chars):');
    console.log((elementInfo.outerHTML ?? '').substring(0, 2000));
    console.log('=== End DOM Structure ===');
  } catch (error) {
    console.log(`Error inspecting element "${selector}": ${String(error)}`);
  }
});

// Debug step to print all window URLs
When('I print all window URLs', async function(this: ApplicationWorld) {
  if (!this.app) {
    throw new Error('Application is not available');
  }

  const allWindows = this.app.windows();
  console.log(`=== Total windows: ${allWindows.length} ===`);

  for (let index = 0; index < allWindows.length; index++) {
    const win = allWindows[index];
    try {
      const url = win.url();
      const title = await win.title();
      const isClosed = win.isClosed();
      console.log(`Window ${index}: URL=${url}, Title=${title}, Closed=${isClosed}`);
    } catch (error) {
      console.log(`Window ${index}: Error getting info - ${String(error)}`);
    }
  }
  console.log('=== End Window List ===');
});
