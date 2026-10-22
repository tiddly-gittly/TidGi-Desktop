import { Given, Then } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { Page } from 'playwright';
import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
import { captureWindowScreenshot } from '../supports/webContentsViewHelper';
import type { ApplicationWorld } from './application';

const promptContexts = new WeakMap<ApplicationWorld, { chat: Page; treeText: string[] }>();

Given('the test model advertises reasoning and temperature parameters', async function(this: ApplicationWorld) {
  assert(this.currentWindow);
  await this.currentWindow.evaluate(async () => {
    const account = (await window.service.externalAPI.getProviderAccounts()).find(item => item.providerId === 'test-provider');
    if (!account) throw new Error('Test provider missing');
    await window.service.externalAPI.setProviderAccount({
      ...account,
      catalogProvider: {
        id: 'test-provider',
        name: 'Test provider',
        env: [],
        models: [{
          id: 'test-model',
          name: 'test-model',
          attachment: false,
          reasoning: true,
          reasoningEfforts: ['low', 'high'],
          temperature: true,
          toolCall: true,
          limit: { output: 8192 },
        }],
      },
    });
  });
});

Then('the selected model parameters should persist and reach the actual model request', async function(this: ApplicationWorld) {
  const page = this.currentWindow;
  assert(page && this.mockOpenAIServer);
  const dialog = page.getByTestId('conversation-model-parameters-dialog');
  await dialog.getByRole('combobox').click();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['模型默认值', 'low', 'high']);
  await page.getByRole('option', { name: 'high', exact: true }).click();
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  await dialog.getByRole('spinbutton', { name: /Temperature|温度/ }).fill('0.4');
  await page.evaluate(() =>
    new Promise<void>(resolve =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resolve();
        })
      )
    )
  );
  assert(await captureWindowScreenshot(this.app!, page, path.resolve('test-artifacts', this.scenarioSlug, 'model-parameters.png')), 'Prompt screenshot capture failed');
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByTestId('conversation-model-parameters').click();
  assert.equal(await dialog.getByRole('combobox').innerText(), 'high');
  assert.equal(await dialog.getByRole('spinbutton', { name: /Temperature|温度/ }).inputValue(), '0.4');
  await page.keyboard.press('Escape');
  this.mockOpenAIServer.addRules([{ response: 'PARAMETER_ACCEPTANCE_COMPLETE', stream: false }]);
  await page.getByTestId('agent-message-input').fill('Verify selected parameters');
  await page.getByTestId('agent-message-input').press('Enter');
  await backOff(async () => {
    const request = this.mockOpenAIServer!.getLastRequest();
    assert(request);
    assert.equal(request.reasoning_effort, 'high');
    assert.equal(request.temperature, 0.4);
    assert.equal(request.top_p, 0.95);
  }, { numOfAttempts: 30, startingDelay: 100, maxDelay: 1000 });
});

Then('the prompt tree and message list should show the same history tools and unsent input', async function(this: ApplicationWorld) {
  const chat = this.currentWindow;
  assert(chat);
  await chat.getByTestId('assistant-run-status').waitFor({ state: 'hidden', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  await chat.getByTestId('agent-message-input').fill('UNSENT_PREVIEW_INPUT');
  await chat.getByTestId('prompt-preview-button').click();
  const page = await this.getWindow('promptPreview');
  assert(page);
  this.currentWindow = page;
  const inspector = page.getByTestId('prompt-execution-inspector');
  const tree = page.getByTestId('prompt-preview-tree');
  await tree.locator('[data-prompt-entry-id]').first().waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
  const entries = tree.locator('[data-prompt-entry-id]');
  const treeIds = await entries.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-prompt-entry-id')));
  const treeText = await entries.allTextContents();
  promptContexts.set(this, { chat, treeText });
  assert(treeText.some(text => text.includes('PROMPT_HISTORY_USER')));
  assert(treeText.some(text => text.includes('PROMPT_HISTORY_ASSISTANT')));
  assert(treeText.some(text => text.includes('wiki-search')));
  assert(treeText.some(text => text.includes('UNSENT_PREVIEW_INPUT')));
  assert(await captureWindowScreenshot(this.app!, page, path.resolve('test-artifacts', this.scenarioSlug, 'prompt-tree.png')), 'Prompt screenshot capture failed');
  await tree.getByTestId('prompt-preview-entry').filter({ hasText: 'UNSENT_PREVIEW_INPUT' }).scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    new Promise<void>(resolve =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resolve();
        })
      )
    )
  );
  assert(await captureWindowScreenshot(this.app!, page, path.resolve('test-artifacts', this.scenarioSlug, 'prompt-tree-history.png')), 'Prompt screenshot capture failed');
  await inspector.getByRole('tab').nth(1).click();
  const flatEntries = page.getByTestId('prompt-preview-flat').locator('[data-prompt-entry-id]');
  assert.deepEqual(await flatEntries.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-prompt-entry-id'))), treeIds);
  assert.deepEqual(await flatEntries.allTextContents(), treeText);
  assert(await captureWindowScreenshot(this.app!, page, path.resolve('test-artifacts', this.scenarioSlug, 'prompt-flat.png')), 'Prompt screenshot capture failed');
});

Then('prompt message details should close with Escape', async function(this: ApplicationWorld) {
  const page = this.currentWindow!;
  const inspector = page.getByTestId('prompt-execution-inspector');
  await inspector.getByTestId('prompt-preview-entry').filter({ hasText: 'PROMPT_HISTORY_ASSISTANT' }).click();
  await page.getByTestId('prompt-preview-audit-detail').locator('pre').filter({ hasText: 'PROMPT_HISTORY_ASSISTANT' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('prompt-preview-audit-detail').waitFor({ state: 'hidden' });
  assert.equal(await inspector.isVisible(), true);
});

Then('the complete model request should include the unsent input and allow returning to the tree', async function(this: ApplicationWorld) {
  const page = this.currentWindow!;
  const inspector = page.getByTestId('prompt-execution-inspector');
  await inspector.getByTestId('prompt-preview-model-request-detail').click();
  const detail = page.getByTestId('prompt-preview-audit-detail');
  let request = '';
  while (true) {
    await backOff(async () => {
      assert.equal(await detail.getByRole('progressbar').count(), 0, 'Request chunk is still loading');
      assert(await detail.locator('pre').textContent(), 'Request chunk has not arrived');
    }, { numOfAttempts: 30, startingDelay: 100, maxDelay: 1000 });
    request += await detail.locator('pre').textContent();
    const next = detail.getByTestId('prompt-preview-audit-detail-next');
    if (await next.count() === 0) break;
    await next.click();
  }
  JSON.parse(request);
  assert(request.includes('UNSENT_PREVIEW_INPUT'));
  assert(await captureWindowScreenshot(this.app!, page, path.resolve('test-artifacts', this.scenarioSlug, 'prompt-request.png')), 'Prompt screenshot capture failed');
  await page.getByTestId('prompt-preview-detail-back').click();
  await inspector.getByRole('tab').first().click();
  assert.deepEqual(await page.getByTestId('prompt-preview-tree').locator('[data-prompt-entry-id]').allTextContents(), promptContexts.get(this)!.treeText);
});

Then('the prompt form and code editors should both open', async function(this: ApplicationWorld) {
  const page = this.currentWindow!;
  await page.getByRole('switch', { name: /Show editor|显示编辑/ }).check();
  await page.getByRole('tab', { name: /Form Editor|表单编辑/ }).waitFor();
  assert(await captureWindowScreenshot(this.app!, page, path.resolve('test-artifacts', this.scenarioSlug, 'prompt-form.png')), 'Prompt screenshot capture failed');
  await page.getByRole('tab', { name: /Code Editor|代码编辑/ }).click();
  await page.locator('.monaco-editor').waitFor({ timeout: CUCUMBER_GLOBAL_TIMEOUT });
  assert(await captureWindowScreenshot(this.app!, page, path.resolve('test-artifacts', this.scenarioSlug, 'prompt-code.png')), 'Prompt screenshot capture failed');
  await page.getByRole('tab', { name: /Form Editor|表单编辑/ }).click();
});

Then('closing prompt preview should preserve the chat input', async function(this: ApplicationWorld) {
  const page = this.currentWindow!;
  const { chat } = promptContexts.get(this)!;
  const closed = page.waitForEvent('close');
  await page.getByRole('button', { name: /^(Close|关闭提示词预览)/ }).click({ noWaitAfter: true }).catch((error: unknown) => {
    // Electron can destroy this window before Playwright acknowledges the click.
    if (!page.isClosed()) throw error;
  });
  await closed;
  this.currentWindow = chat;
  await chat.getByTestId('agent-message-input').waitFor();
  assert.equal(await chat.getByTestId('agent-message-input').inputValue(), 'UNSENT_PREVIEW_INPUT');
});
