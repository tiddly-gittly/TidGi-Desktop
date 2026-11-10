import { Given, Then } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import assert from 'node:assert/strict';
import path from 'node:path';
import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
import type { ApplicationWorld } from './application';

Given('I queue a two-step wiki search with a delayed final summary', function(this: ApplicationWorld) {
  assert(this.mockOpenAIServer);
  this.mockOpenAIServer.addRules([
    {
      response: 'PROCESS_GOAL: I will inspect two wiki entries.',
      stream: false,
      toolCall: { name: 'wiki-search', arguments: { workspaceName: 'wiki', filter: '[title[Index]]' } },
    },
    { stream: false, toolCall: { name: 'wiki-search', arguments: { workspaceName: 'wiki', filter: '[title[GettingStarted]]' } } },
    { response: 'FINAL_TOOL_SUMMARY: Both searches are complete. This conclusion stays visible.', stream: false, delayMs: 6000 },
  ]);
});

Then('live tool calls should be grouped while process commentary stays visible', async function(this: ApplicationWorld) {
  const page = this.currentWindow;
  assert(page);
  const group = page.getByTestId('tool-group-disclosure');
  await group.waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  assert.equal(await group.getAttribute('open'), null);
  assert.equal(await page.getByTestId('work-disclosure').count(), 0);
  assert.equal(await page.getByTestId('assistant-run-status').isVisible(), true);
  const goal = page.locator('[data-testid="message-bubble"]').filter({ hasText: 'PROCESS_GOAL' });
  // The host renders wikitext in an iframe; accept either renderer surface.
  const textVisible = await goal.count() > 0 && await goal.first().isVisible();
  const frameVisible = await page.locator('[data-testid="assistant-message"] iframe').evaluateAll(frames =>
    frames.some(frame => frame instanceof HTMLIFrameElement && frame.contentDocument?.body.textContent?.includes('PROCESS_GOAL') && frame.getBoundingClientRect().height > 0)
  );
  assert(textVisible || frameVisible, 'Live process commentary should remain visible');
  await page.screenshot({ path: path.resolve('test-artifacts', this.scenarioSlug, 'tools-live.png') });
});

Then('completed tool work should support all three disclosure levels', async function(this: ApplicationWorld) {
  const page = this.currentWindow;
  assert(page);
  await page.getByTestId('assistant-run-status').waitFor({ state: 'hidden', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  const work = page.getByTestId('work-disclosure');
  await work.waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  assert.equal(await work.getAttribute('open'), null);
  assert.match(await work.locator(':scope > summary').innerText(), /2/);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(async mode => window.service.preference.set('themeSource', mode), theme);
    await page.waitForFunction(mode => {
      const surface = document.querySelector('[data-testid="assistant-message"]');
      const foreground = surface && Number(getComputedStyle(surface).color.match(/[\d.]+/)?.[0]);
      return foreground !== null && (mode === 'dark' ? foreground > 200 : foreground < 100);
    }, theme);
    await page.screenshot({ path: path.resolve('test-artifacts', this.scenarioSlug, `tools-${theme}-completed.png`) });
    await work.locator(':scope > summary').click();
    const group = work.getByTestId('tool-group-disclosure');
    assert.equal(await group.getAttribute('open'), null);
    await group.locator(':scope > summary').click();
    const calls = group.getByTestId('tool-disclosure');
    assert(await calls.count() >= 2);
    const result = calls.filter({ hasText: '"filter":"[title[Index]]"' }).first();
    await result.locator(':scope > summary').click();
    assert.notEqual(await result.getAttribute('open'), null);
    const command = result.locator('pre').filter({ hasText: '"filter":"[title[Index]]"' });
    assert.equal(await command.isVisible(), true);
    await command.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve('test-artifacts', this.scenarioSlug, `tools-${theme}-expanded.png`) });
    await result.locator(':scope > summary').click();
    await group.locator(':scope > summary').click();
    await work.locator(':scope > summary').click();
  }
  await backOff(async () => {
    const finalVisible = await page.locator('[data-testid="assistant-message"] iframe').evaluateAll(frames =>
      frames.some(frame =>
        frame instanceof HTMLIFrameElement &&
        frame.contentDocument?.body.textContent?.includes('FINAL_TOOL_SUMMARY') && frame.getBoundingClientRect().height > 0
      )
    );
    assert(finalVisible || await page.getByText('FINAL_TOOL_SUMMARY', { exact: false }).isVisible());
  }, { numOfAttempts: 20, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
});

Then('tool work disclosure should remain accessible after reload', async function(this: ApplicationWorld) {
  const page = this.currentWindow;
  assert(page);
  await page.reload();
  const work = page.getByTestId('work-disclosure');
  await work.waitFor({ state: 'visible', timeout: CUCUMBER_GLOBAL_TIMEOUT });
  assert.equal(await work.getAttribute('open'), null);
  await work.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  assert.notEqual(await work.getAttribute('open'), null);
  await work.getByTestId('tool-group-disclosure').locator(':scope > summary').click();
  assert(await work.getByTestId('tool-disclosure').count() >= 2);
  const tool = work.getByTestId('tool-group-disclosure').getByTestId('message-bubble').filter({ has: page.getByTestId('assistant-message') }).first();
  const messageId = await tool.getAttribute('data-memeloop-message-id');
  assert(messageId);
  await work.locator(':scope > summary').click();
  await page.locator(`[data-timeline-message-id="${messageId}"]`).click();
  await backOff(async () => {
    assert.notEqual(await work.getAttribute('open'), null);
    assert.notEqual(await work.getByTestId('tool-group-disclosure').getAttribute('open'), null);
    assert.notEqual(await tool.getByTestId('tool-disclosure').getAttribute('open'), null);
    const focused = await tool.evaluate(element => document.activeElement === element);
    assert(focused, 'Timeline reveal should focus the selected tool');
    const target = await tool.boundingBox();
    const viewport = await page.getByTestId('conversation-viewport').boundingBox();
    assert(target && viewport && target.y >= viewport.y - 2 && target.y < viewport.y + viewport.height);
  }, { numOfAttempts: 30, startingDelay: 100, timeMultiple: 1, maxDelay: 100 });
  await page.screenshot({ path: path.resolve('test-artifacts', this.scenarioSlug, 'tools-timeline-reveal.png') });
});
