import { After, DataTable, Given, Then } from '@cucumber/cucumber';
import { MockOpenAIServer } from '../supports/mockOpenAI';
import type { ApplicationWorld } from './application';

// Agent-specific Given steps
Given('I have started the mock OpenAI server', function(this: ApplicationWorld, dataTable: DataTable | undefined, done: (error?: Error) => void) {
  try {
    const rules: Array<{ response: string; stream?: boolean }> = [];
    if (dataTable && typeof dataTable.raw === 'function') {
      const rows = dataTable.raw();
      // Skip header row
      for (let index = 1; index < rows.length; index++) {
        const row = rows[index];
        const response = String(row[0] ?? '').trim();
        const stream = String(row[1] ?? '').trim().toLowerCase() === 'true';
        if (response) rules.push({ response, stream });
      }
    }

    this.mockOpenAIServer = new MockOpenAIServer(15121, rules);
    this.mockOpenAIServer.start().then(() => {
      done();
    }).catch((error_: unknown) => {
      done(error_ as Error);
    });
  } catch (error) {
    done(error as Error);
  }
});

// Agent-specific cleanup - only for agent scenarios
After({ tags: '@agent' }, async function(this: ApplicationWorld) {
  // Stop mock OpenAI server
  if (this.mockOpenAIServer) {
    await this.mockOpenAIServer.stop();
    this.mockOpenAIServer = undefined;
  }
});

// Only keep agent-specific steps that can't use generic ones

Then('I should see {int} messages in chat history', async function(this: ApplicationWorld, expectedCount: number) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  // Use precise selector based on the provided HTML structure
  const messageSelector = '[data-testid="message-bubble"]';

  try {
    // Wait for messages to reach expected count, checking periodically for streaming
    for (let attempt = 1; attempt <= expectedCount * 3; attempt++) {
      try {
        // Wait for at least one message to exist
        await currentWindow.waitForSelector(messageSelector, { timeout: 5000 });

        // Count current messages
        const messages = currentWindow.locator(messageSelector);
        const currentCount = await messages.count();

        if (currentCount === expectedCount) {
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
      }
    }

    // Final attempt to get the count
    const finalCount = await currentWindow.locator(messageSelector).count();
    throw new Error(`Expected ${expectedCount} messages but found ${finalCount} after waiting for streaming to complete`);
  } catch (error) {
    throw new Error(`Could not find expected ${expectedCount} messages. Error: ${(error as Error).message}`);
  }
});
