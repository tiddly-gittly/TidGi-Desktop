import { Given, Then, When } from '@cucumber/cucumber';
import { backOff } from 'exponential-backoff';
import { CUCUMBER_GLOBAL_TIMEOUT } from '../supports/timeouts';
import type { ApplicationWorld } from './application';

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
