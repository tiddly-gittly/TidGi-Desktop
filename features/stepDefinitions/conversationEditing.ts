import { Then } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import assert from 'node:assert/strict';
import path from 'node:path';
import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
import type { ApplicationWorld } from './application';

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
  const prepareClipboard = async () => {
    await app.evaluate(({ clipboard }) => {
      clipboard.clear();
    });
  };
  const expectClipboard = async (expected: string) => {
    await backOff(async () => {
      const actual = await app.evaluate(({ clipboard }) => clipboard.readText());
      const state = await page.evaluate(() => ({
        focused: document.hasFocus(),
        errors: Array.from(document.querySelectorAll('[role="alert"]')).map(element => element.textContent),
      }));
      assert(actual === expected, `Clipboard has not received ${expected}; actual length=${actual.length}; renderer=${JSON.stringify(state)}`);
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
      await prepareClipboard();
      await root.getByTestId('message-copy').click();
      await expectClipboard(source);
      await page.getByTestId('agent-message-input').focus();
      await page.mouse.move(1, 1);
      await root.getByTestId('message-copy').focus();
      assert.equal(await toolbar.evaluate(element => getComputedStyle(element).opacity), '1', 'Keyboard focus reveals the same tools');
      await prepareClipboard();
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
        await prepareClipboard();
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

Then('rendered message scripts should not execute in the host or frame', async function(this: ApplicationWorld) {
  const page = this.currentWindow;
  if (!page) throw new Error('No conversation window');
  const snapshot = await page.waitForFunction(
    () => {
      const frame = document.querySelector<HTMLIFrameElement>('[data-testid="assistant-message"] iframe[data-testid="rendered-message"]');
      const frameDocument = frame?.contentDocument;
      if (!Array.from(frameDocument?.querySelectorAll('strong') ?? []).some(element => element.textContent?.includes('HTML_RENDERED'))) return false;
      return {
        hostExecuted: Boolean((window as Window & { chatScriptExecuted?: boolean }).chatScriptExecuted),
        frameExecuted: Boolean((frameDocument?.defaultView as (Window & { chatScriptExecuted?: boolean }) | null)?.chatScriptExecuted),
      };
    },
    undefined,
    { timeout: CUCUMBER_GLOBAL_TIMEOUT },
  );
  try {
    const state = await snapshot.jsonValue();
    assert(state && !state.hostExecuted && !state.frameExecuted, 'Message scripts escaped rendering isolation');
  } finally {
    await snapshot.dispose();
  }
});
