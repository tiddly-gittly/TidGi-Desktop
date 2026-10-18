import { Given, Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
import type { ApplicationWorld } from './application';

When('I hover the first user message', async function(this: ApplicationWorld) {
  if (!this.currentWindow) throw new Error('No conversation window');
  await this.currentWindow.locator('[data-memeloop-turn-anchor="true"]').first().hover();
});

Then('message surfaces and shared tools should work in {string} theme', async function(this: ApplicationWorld, mode: string) {
  const page = this.currentWindow;
  const app = this.app;
  if (!page || !app || (mode !== 'light' && mode !== 'dark')) throw new Error('Missing app or invalid theme');
  await page.evaluate(async theme => {
    if (theme === 'light' || theme === 'dark') await window.service.preference.set('themeSource', theme);
  }, mode);
  await page.waitForFunction(
    theme => {
      const message = document.querySelector('[data-testid="assistant-message"]');
      const red = message && Number(getComputedStyle(message).color.match(/[\d.]+/)?.[0]);
      return red !== null && (theme === 'dark' ? red > 200 : red < 100);
    },
    mode,
    { timeout: CUCUMBER_GLOBAL_TIMEOUT },
  );
  const user = page.locator('[data-memeloop-turn-anchor="true"]').first();
  const assistant = page.locator('[data-testid="message-bubble"]:has([data-testid="assistant-message"])').first();
  const screenshot = async (state: string) => {
    await page.screenshot({ path: path.resolve('test-artifacts', this.scenarioSlug, `message-${mode}-${state}.png`) });
  };
  const clipboardBefore = await app.evaluate(({ clipboard }) => clipboard.readText());
  const expectClipboard = async (expected: string) => {
    await backOff(async () => {
      const actual = await app.evaluate(({ clipboard }) => clipboard.readText());
      assert(actual === expected, 'Clipboard has not received the expected message content');
    }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
  };
  try {
    for (
      const [role, root, source] of [
        ['user', user, "''TOOLBAR_QUESTION''"],
        ['assistant', assistant, "''TOOLBAR_REPLY''"],
      ] as const
    ) {
      const toolbar = root.getByTestId('message-toolbar');
      const frame = root.frameLocator('iframe[data-testid="rendered-message"]');
      await frame.locator('strong').waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
      await backOff(async () => {
        const colors = await root.evaluate(element => {
          const iframe = element.querySelector<HTMLIFrameElement>('iframe[data-testid="rendered-message"]')!;
          const document = iframe.contentDocument!;
          const body = document.body;
          const surface = element.querySelector('[data-testid="user-message-surface"]');
          return {
            frameBackground: getComputedStyle(iframe).backgroundColor,
            bodyBackground: document.defaultView!.getComputedStyle(body).backgroundColor,
            foreground: document.defaultView!.getComputedStyle(body).color,
            expectedForeground: getComputedStyle(surface ?? element).color,
            toolbarInsideSurface: !!surface?.querySelector('[data-testid="message-toolbar"]'),
          };
        });
        assert.equal(colors.frameBackground, 'rgba(0, 0, 0, 0)');
        assert.equal(colors.bodyBackground, 'rgba(0, 0, 0, 0)');
        assert.equal(colors.foreground, colors.expectedForeground);
        assert.equal(colors.toolbarInsideSurface, false);
      }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
      await page.getByTestId('agent-message-input').focus();
      await page.mouse.move(1, 1);
      assert.equal(await toolbar.evaluate(element => getComputedStyle(element).opacity), '0');
      await screenshot(`${role}-idle`);
      await root.hover();
      assert.equal(await toolbar.evaluate(element => getComputedStyle(element).opacity), '1');
      const surfaceBox = await root.locator(role === 'user' ? '[data-testid="user-message-surface"]' : 'iframe').boundingBox();
      const toolbarBox = await toolbar.boundingBox();
      assert(surfaceBox && toolbarBox && toolbarBox.y >= surfaceBox.y + surfaceBox.height, 'Tools must be below the message surface');
      const frameBox = await root.locator('iframe').boundingBox();
      assert(frameBox && frameBox.height <= 30, 'A single rendered line must not retain an empty iframe viewport');
      await screenshot(`${role}-hover`);
      await root.getByTestId('message-copy').click();
      await expectClipboard(source);
      await page.getByTestId('agent-message-input').focus();
      await page.mouse.move(1, 1);
      await root.getByTestId('message-copy').focus();
      assert.equal(await toolbar.evaluate(element => getComputedStyle(element).opacity), '1', 'Keyboard focus reveals the same tools');
      await root.getByTestId('message-copy').press('Enter');
      await expectClipboard(source);
      assert.equal(await root.getByTestId('message-render-toggle').count(), 0, 'Source controls must not be displayed');
    }
    await user.hover();
    await user.getByTestId('message-edit').click();
    await user.getByTestId('message-edit-input').fill('TOOLBAR_DRAFT');
    await screenshot('editing');
    await user.getByTestId('message-edit-input').press('Escape');
    await user.getByTestId('message-edit-input').waitFor({ state: 'hidden' });
    await user.hover();
    await user.getByTestId('message-edit').click();
    assert.equal(await user.getByTestId('message-edit-input').inputValue(), 'TOOLBAR_DRAFT');
    await user.getByTestId('message-edit-discard').click();
    if (mode === 'dark') {
      const session = await page.context().newCDPSession(page);
      try {
        await session.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 760, deviceScaleFactor: 1, mobile: false });
        await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        await page.waitForFunction(() => window.matchMedia('(hover: none)').matches, undefined, { timeout: CUCUMBER_GLOBAL_TIMEOUT });
        await page.getByTestId('agent-message-input').focus();
        await page.mouse.move(1, 1);
        for (const root of [user, assistant]) {
          assert.equal(await root.getByTestId('message-toolbar').evaluate(element => getComputedStyle(element).opacity), '1');
        }
        await screenshot('narrow-touch');
        const button = await user.getByTestId('message-copy').boundingBox();
        assert(button);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: button.x + button.width / 2, y: button.y + button.height / 2 }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expectClipboard("''TOOLBAR_QUESTION''");
      } finally {
        await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
        await session.send('Emulation.clearDeviceMetricsOverride');
        await session.detach();
      }
    }
  } finally {
    await app.evaluate(({ clipboard }, original) => {
      clipboard.writeText(original);
    }, clipboardBefore);
  }
});

Given('the model echoes the advanced wikitext sample', async function(this: ApplicationWorld) {
  if (!this.mockOpenAIServer) throw new Error('Mock provider missing');
  const response = await readFile(path.resolve('features/fixtures/chat-rich-wikitext.txt'), 'utf8');
  this.mockOpenAIServer.addRules([{ response, stream: false }]);
});

When('I send the advanced wikitext sample', async function(this: ApplicationWorld) {
  if (!this.currentWindow) throw new Error('No conversation window');
  const source = await readFile(path.resolve('features/fixtures/chat-rich-wikitext.txt'), 'utf8');
  await this.currentWindow.getByTestId('agent-message-input').fill(source);
  await this.currentWindow.getByTestId('agent-message-input').press('Enter');
});

Then('both completed messages render advanced wikitext in {string} theme', async function(this: ApplicationWorld, mode: string) {
  const page = this.currentWindow;
  if (!page) throw new Error('No conversation window');
  await page.evaluate(async theme => {
    if (theme === 'light' || theme === 'dark') await window.service.preference.set('themeSource', theme);
  }, mode);
  await page.waitForFunction(
    theme => {
      const reply = document.querySelector('[data-testid="assistant-message"]');
      const red = reply && Number(getComputedStyle(reply).color.match(/[\d.]+/)?.[0]);
      return red !== null && (theme === 'dark' ? red > 200 : red < 100);
    },
    mode,
    { timeout: CUCUMBER_GLOBAL_TIMEOUT },
  );
  await page.getByTestId('assistant-run-status').waitFor({ state: 'hidden', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  for (const role of ['user', 'assistant']) {
    const root = page.locator(role === 'user' ? '[data-memeloop-turn-anchor="true"]' : '[data-testid="message-bubble"]:has([data-testid="assistant-message"])').first();
    const frame = root.frameLocator('iframe[data-testid="rendered-message"]');
    await frame.locator('table tbody tr').first().waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
    const cells = await frame.locator('tbody tr').allTextContents();
    assert(cells.some(row => row.includes('变量已展开')), 'Local variable was not expanded');
    assert(cells.some(row => row.includes('欢迎，宏已展开！')), 'Parameterized macro was not expanded');
    assert(cells.some(row => row.includes('过滤器计算') && row.includes('5')), 'Filter arithmetic was not evaluated');
    assert(cells.some(row => row.includes('核心条目字段转入') && /\d+\.\d+\.\d+/.test(row)), 'Selected wiki field transclusion was not evaluated');
    assert.deepEqual(await frame.locator('ul li').allTextContents(), ['Alpha', 'Beta']);
    assert.equal(await frame.locator('table strong').textContent(), '加粗');
    assert.equal(await frame.locator('table em').textContent(), '斜体');
    assert((await frame.locator('blockquote').textContent())?.includes('变量已展开'));
    assert.equal(await root.getByTestId('message-render-toggle').count(), 0);
    const border = await frame.locator('td').first().evaluate(element => getComputedStyle(element).borderTopStyle);
    assert.equal(border, 'solid', 'Rendered tables need visible cell borders');
    await root.scrollIntoViewIfNeeded();
    await root.hover();
    await page.screenshot({ path: path.resolve('test-artifacts', this.scenarioSlug, `advanced-wiki-${mode}-${role}.png`) });
  }
});

When('I reload the conversation window', async function(this: ApplicationWorld) {
  if (!this.currentWindow) throw new Error('No conversation window');
  await this.currentWindow.reload();
  await this.currentWindow.locator('[data-testid="agent-message-input"]').waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
});

Then('the message editor should contain {string}', async function(this: ApplicationWorld, text: string) {
  if (!this.currentWindow) throw new Error('No conversation window');
  await this.currentWindow.waitForFunction(
    expected => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-testid="message-edit-input"]');
      return input?.value === expected;
    },
    text,
    { timeout: CUCUMBER_GLOBAL_TIMEOUT },
  );
});

Then('the conversation edit draft should be persisted as {string}', async function(this: ApplicationWorld, text: string) {
  const page = this.currentWindow;
  if (!page) throw new Error('No conversation window');
  await backOff(async () => {
    const actual = await page.evaluate(async () => {
      const root = document.querySelector('[data-testid="message-edit-input"]')?.closest('[data-memeloop-message-id]');
      const messageId = root?.getAttribute('data-memeloop-message-id');
      if (!messageId) throw new Error('No edited message');
      const message = await window.service.agentInstance.getAgentMessage(messageId);
      if (!message) throw new Error('No durable edited message');
      return (await window.service.agentInstance.loadConversationEditSource(message.conversationId, messageId)).draft?.text;
    });
    if (actual !== text) throw new Error('Draft has not been persisted');
  }, { numOfAttempts: 30, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
});

Then('the edited model request should exclude the original continuation', function(this: ApplicationWorld) {
  const requests = this.mockOpenAIServer?.getAllRequests() ?? [];
  const request = requests.findLast(item => JSON.stringify(item.messages).includes('EDITED_QUESTION'));
  if (!request) throw new Error('Edited branch did not reach the model');
  const content = JSON.stringify(request.messages);
  if (content.includes('ORIGINAL_QUESTION') || content.includes('ORIGINAL_LATER_QUESTION') || content.includes('ORIGINAL_LATER_REPLY')) {
    throw new Error('Model context contains the abandoned continuation');
  }
});

Then('the timeline should mark a message with alternative histories', async function(this: ApplicationWorld) {
  const page = this.currentWindow;
  if (!page) throw new Error('No conversation window');
  const marker = page.locator('[data-testid="conversation-timeline"] [data-has-alternatives="true"]').first();
  await marker.waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
  const label = await marker.getAttribute('aria-label');
  if (!label?.includes('2') || !label.includes('替代历史')) throw new Error('Timeline did not describe alternatives accessibly');
  await marker.hover();
  await page.getByRole('tooltip').filter({ hasText: '替代历史' }).waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
  await backOff(async () => {
    const markerColor = await marker.evaluate(element => getComputedStyle(element, '::after').backgroundColor);
    const secondaryColor = await page.locator('[data-testid="message-branches"]').first().evaluate(element => getComputedStyle(element).color);
    if (markerColor !== secondaryColor) throw new Error(`Alternative history marker color ${markerColor} differs from secondary ${secondaryColor}`);
  }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
});

Given('the next model request fails after a delay', function(this: ApplicationWorld) {
  if (!this.mockOpenAIServer) throw new Error('Mock provider missing');
  this.mockOpenAIServer.addRules([{ statusCode: 403, delayMs: 1500 }]);
});

Given('the next model request succeeds after a delay', function(this: ApplicationWorld) {
  if (!this.mockOpenAIServer) throw new Error('Mock provider missing');
  this.mockOpenAIServer.addRules([{ response: 'DELAYED_REPLY', stream: true, delayMs: 1500 }]);
});

Then('rendered message scripts should not execute in the host or frame', async function(this: ApplicationWorld) {
  const page = this.currentWindow;
  if (!page) throw new Error('No conversation window');
  const frame = page.frameLocator('[data-testid="assistant-message"] iframe[data-testid="rendered-message"]');
  await frame.locator('strong').filter({ hasText: 'HTML_RENDERED' }).waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
  const hostExecuted = await page.evaluate(() => (window as Window & { chatScriptExecuted?: boolean }).chatScriptExecuted);
  const frameExecuted = await frame.locator('body').evaluate(element => (element.ownerDocument.defaultView as Window & { chatScriptExecuted?: boolean }).chatScriptExecuted);
  if (hostExecuted || frameExecuted) throw new Error('Message scripts escaped rendering isolation');
});

When('I choose the {string} workspace for this conversation', async function(this: ApplicationWorld, name: string) {
  const page = this.currentWindow;
  if (!page) throw new Error('No conversation window');
  await page.locator('[data-testid="conversation-workspace-select"] [role="combobox"]').click();
  await page.getByRole('option', { name, exact: true }).click();
});

Then('the conversation workspace selection should be {string}', async function(this: ApplicationWorld, name: string) {
  if (!this.currentWindow) throw new Error('No conversation window');
  await this.currentWindow.locator('[data-testid="conversation-workspace-select"] [role="combobox"]').filter({ hasText: name }).waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
});

Then('the assistant should render bold wiki text {string}', async function(this: ApplicationWorld, text: string) {
  if (!this.currentWindow) throw new Error('No conversation window');
  await this.currentWindow.frameLocator('[data-testid="assistant-message"] iframe[data-testid="rendered-message"]').locator('strong').filter({ hasText: text }).waitFor({
    timeout: CUCUMBER_GLOBAL_TIMEOUT,
  });
});
