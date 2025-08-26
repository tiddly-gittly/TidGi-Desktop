import { After, DataTable, Given, Then } from '@cucumber/cucumber';
import fs from 'fs-extra';
import { isEqual, omit } from 'lodash';
import { MockOpenAIServer } from '../supports/mockOpenAI';
import { settingsPath } from '../supports/paths';
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

// Shared provider config used across steps (kept at module scope for reuse)
const providerConfig = {
  provider: 'TestProvider',
  baseURL: 'http://127.0.0.1:15121/v1',
  models: [{ name: 'test-model', features: ['language'] }],
  providerClass: 'openAICompatible',
  isPreset: false,
  enabled: true,
} as Record<string, unknown>;

const desiredModelParameters = { temperature: 0.7, systemPrompt: 'You are a helpful assistant.', topP: 0.95 };

Given('I ensure test ai settings', function() {
  // Build expected aiSettings from shared providerConfig and compare strictly with actual using isEqual
  const modelsArray = (providerConfig.models as Array<Record<string, string>> | undefined) || [];
  const modelName = modelsArray[0]?.name;
  const providerName = providerConfig.provider as string;

  const expected = {
    providers: [providerConfig],
    defaultConfig: { api: { provider: providerName, model: modelName }, modelParameters: desiredModelParameters },
  } as Record<string, unknown>;

  const parsed = fs.readJsonSync(settingsPath) as Record<string, unknown>;
  const actual = (parsed.aiSettings as Record<string, unknown> | undefined) || null;

  if (!isEqual(actual, expected)) {
    console.error('aiSettings mismatch. expected:', JSON.stringify(expected, null, 2));
    console.error('aiSettings actual:', JSON.stringify(actual, null, 2));
    throw new Error('aiSettings do not match expected TestProvider configuration');
  }
});

Given('I add test ai settings', function() {
  // Overwrite aiSettings with minimal desired configuration (simple insert)
  const existing = fs.readJsonSync(settingsPath) as Record<string, unknown>;
  const modelsArray = (providerConfig.models as Array<Record<string, string>> | undefined) || [];
  const modelName = modelsArray[0]?.name;
  const newAi = {
    providers: [providerConfig],
    defaultConfig: { api: { provider: providerConfig.provider as string, model: modelName }, modelParameters: desiredModelParameters },
  } as Record<string, unknown>;
  fs.writeJsonSync(settingsPath, { ...existing, aiSettings: newAi }, { spaces: 2 });
});

Given('I clear test ai settings', function() {
  if (!fs.existsSync(settingsPath)) return;
  const parsed = fs.readJsonSync(settingsPath) as Record<string, unknown>;
  const cleaned = omit(parsed, ['aiSettings']);
  fs.writeJsonSync(settingsPath, cleaned, { spaces: 2 });
});
