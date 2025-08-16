import { Then } from '@cucumber/cucumber';
import type { ApplicationWorld } from './application';

// Only keep agent-specific steps that can't use generic ones

Then('I should see {int} messages in chat history', async function(this: ApplicationWorld, expectedCount: number) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  // Use precise selector based on the provided HTML structure
  const messageSelector = '[data-testid="message-bubble"]';

  console.log(`Looking for ${expectedCount} messages with selector: ${messageSelector}`);

  try {
    // Wait for messages to reach expected count, checking periodically for streaming
    for (let attempt = 1; attempt <= expectedCount * 3; attempt++) {
      try {
        // Wait for at least one message to exist
        await currentWindow.waitForSelector(messageSelector, { timeout: 5000 });

        // Count current messages
        const messages = currentWindow.locator(messageSelector);
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
          await currentWindow.waitForTimeout(2000);
        }
      } catch (timeoutError) {
        if (attempt === expectedCount * 3) {
          throw timeoutError;
        }
        console.log(`Waiting for more messages... (attempt ${attempt})`);
      }
    }

    // Final attempt to get the count
    const finalCount = await currentWindow.locator(messageSelector).count();
    throw new Error(`Expected ${expectedCount} messages but found ${finalCount} after waiting for streaming to complete`);
  } catch (error) {
    throw new Error(`Could not find expected ${expectedCount} messages. Error: ${(error as Error).message}`);
  }
});
