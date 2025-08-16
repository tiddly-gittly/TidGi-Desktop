import { Then, When } from '@cucumber/cucumber';
import type { ApplicationWorld } from './application';

// Only keep agent-specific steps that can't use generic ones

When('I focus the message input {string} and type {string} and press Enter', async function(this: ApplicationWorld, inputBoxName: string, textToInput: string) {
  if (!this.mainWindow) {
    throw new Error('Main window is not available');
  }

  // Use precise selector based on the provided HTML structure
  const selector = 'textarea.MuiInputBase-input.MuiOutlinedInput-input[placeholder*="输入消息"]';
  
  try {
    const element = this.mainWindow.locator(selector).first();
    await element.waitFor({ state: 'visible', timeout: 10000 });
    await element.click();
    await element.fill(textToInput);
    await this.mainWindow.keyboard.press('Enter');
    console.log(`✓ Successfully typed "${textToInput}" in ${inputBoxName} and pressed Enter`);
  } catch (error) {
    throw new Error(`Failed to find and use message input box "${inputBoxName}": ${error as Error}`);
  }
});

Then('I should see {int} messages in chat history', async function(this: ApplicationWorld, expectedCount: number) {
  if (!this.mainWindow) {
    throw new Error('Main window is not available');
  }

  // Use precise selector based on the provided HTML structure
  const messageSelector = '[data-testid="message-bubble"]';

  console.log(`Looking for ${expectedCount} messages with selector: ${messageSelector}`);

  try {
    // Wait for messages to reach expected count, checking periodically for streaming
    for (let attempt = 1; attempt <= expectedCount * 3; attempt++) {
      try {
        // Wait for at least one message to exist
        await this.mainWindow.waitForSelector(messageSelector, { timeout: 5000 });

        // Count current messages
        const messages = this.mainWindow.locator(messageSelector);
        const currentCount = await messages.count();

        console.log(`Attempt ${attempt}: Found ${currentCount} messages (expecting ${expectedCount})`);

        if (currentCount === expectedCount) {
          console.log(`✓ Found exactly ${expectedCount} messages in chat history`);
          return;
        } else if (currentCount > expectedCount) {
          throw new Error(`Expected ${expectedCount} messages but found ${currentCount} (too many)`);
        }

        // If not enough messages yet, wait a bit more for streaming
        if (attempt < expectedCount * 3) {
          await this.mainWindow.waitForTimeout(2000);
        }
      } catch (timeoutError) {
        if (attempt === expectedCount * 3) {
          throw timeoutError;
        }
        console.log(`Waiting for more messages... (attempt ${attempt})`);
      }
    }

    // Final attempt to get the count
    const finalCount = await this.mainWindow.locator(messageSelector).count();
    throw new Error(`Expected ${expectedCount} messages but found ${finalCount} after waiting for streaming to complete`);
    
  } catch (error) {
    throw new Error(`Could not find expected ${expectedCount} messages. Error: ${(error as Error).message}`);
  }
});
