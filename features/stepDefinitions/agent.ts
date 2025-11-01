import { After, DataTable, Given, Then } from '@cucumber/cucumber';
import { AIGlobalSettings, AIProviderConfig } from '@services/externalAPI/interface';
import { backOff } from 'exponential-backoff';
import fs from 'fs-extra';
import { isEqual, omit } from 'lodash';
import path from 'path';
import type { ISettingFile } from '../../src/services/database/interface';
import { MockOpenAIServer } from '../supports/mockOpenAI';
import { settingsPath } from '../supports/paths';
import type { ApplicationWorld } from './application';

// Backoff configuration for retries
const BACKOFF_OPTIONS = {
  numOfAttempts: 10,
  startingDelay: 200,
  timeMultiple: 1.5,
};

/**
 * Generate deterministic embedding vector based on a semantic tag
 * This allows us to control similarity in tests without writing full 384-dim vectors
 *
 * Strategy:
 * - Similar tags (note1, note1-similar) -> similar vectors (high similarity)
 * - Different tags (note1, note2) -> different vectors (medium similarity)
 * - Unrelated tags (note1, unrelated) -> very different vectors (low similarity)
 */
function generateSemanticEmbedding(tag: string): number[] {
  const vector: number[] = [];

  // Parse tag to determine semantic relationship
  // Format: "note1", "note2", "query-note1", "unrelated"
  const baseTag = tag.replace(/-similar$/, '').replace(/^query-/, '');
  const isSimilar = tag.includes('-similar');
  const isQuery = tag.startsWith('query-');
  const isUnrelated = tag === 'unrelated';

  // Generate base vector from tag
  const seed = Array.from(baseTag).reduce((hash, char) => {
    return ((hash << 5) - hash) + char.charCodeAt(0);
  }, 0);

  for (let dimension = 0; dimension < 384; dimension++) {
    const x = Math.sin((seed + dimension) * 0.1) * 10000;
    let value = x - Math.floor(x);

    // Adjust vector based on semantic relationship
    if (isUnrelated) {
      // Completely different direction
      value = -value;
    } else if (isSimilar || isQuery) {
      // Very similar (>95% similarity) - add small noise
      value = value + (Math.sin(dimension * 0.01) * 0.05);
    }

    // Normalize to [-1, 1]
    vector.push(value * 2 - 1);
  }

  return vector;
}

// Agent-specific Given steps
Given('I have started the mock OpenAI server', function(this: ApplicationWorld, dataTable: DataTable | undefined, done: (error?: Error) => void) {
  try {
    const rules: Array<{ response: string; stream?: boolean; embedding?: number[] }> = [];
    if (dataTable && typeof dataTable.raw === 'function') {
      const rows = dataTable.raw();
      // Skip header row
      for (let index = 1; index < rows.length; index++) {
        const row = rows[index];
        const response = (row[0] ?? '').trim();
        const stream = (row[1] ?? '').trim().toLowerCase() === 'true';
        const embeddingTag = (row[2] ?? '').trim();

        // Generate embedding from semantic tag if provided
        let embedding: number[] | undefined;
        if (embeddingTag) {
          embedding = generateSemanticEmbedding(embeddingTag);
        }

        if (response) rules.push({ response, stream, embedding });
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

// Mock OpenAI server cleanup - for scenarios using mock OpenAI
After({ tags: '@mockOpenAI' }, async function(this: ApplicationWorld) {
  // Stop mock OpenAI server with timeout protection
  if (this.mockOpenAIServer) {
    try {
      await Promise.race([
        this.mockOpenAIServer.stop(),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Ignore errors during cleanup
    } finally {
      this.mockOpenAIServer = undefined;
    }
  }
});

// Only keep agent-specific steps that can't use generic ones

Then('I should see {int} messages in chat history', async function(this: ApplicationWorld, expectedCount: number) {
  const currentWindow = this.currentWindow || this.mainWindow;
  if (!currentWindow) {
    throw new Error('No current window is available');
  }

  const messageSelector = '[data-testid="message-bubble"]';

  await backOff(
    async () => {
      // Wait for at least one message to exist
      await currentWindow.waitForSelector(messageSelector, { timeout: 5000 });

      // Count current messages
      const messages = currentWindow.locator(messageSelector);
      const currentCount = await messages.count();

      if (currentCount === expectedCount) {
        return; // Success
      } else if (currentCount > expectedCount) {
        throw new Error(`Expected ${expectedCount} messages but found ${currentCount} (too many)`);
      } else {
        // Not enough messages yet, throw to trigger retry
        throw new Error(`Expected ${expectedCount} messages but found ${currentCount}`);
      }
    },
    BACKOFF_OPTIONS,
  ).catch(async (error: unknown) => {
    // Get final count for error message
    try {
      const finalCount = await currentWindow.locator(messageSelector).count();
      throw new Error(`Could not find expected ${expectedCount} messages. Found ${finalCount}. Error: ${(error as Error).message}`);
    } catch {
      throw new Error(`Could not find expected ${expectedCount} messages. Error: ${(error as Error).message}`);
    }
  });
});

Then('the last AI request should contain system prompt {string}', async function(this: ApplicationWorld, expectedPrompt: string) {
  if (!this.mockOpenAIServer) {
    throw new Error('Mock OpenAI server is not running');
  }

  const lastRequest = this.mockOpenAIServer.getLastRequest();
  if (!lastRequest) {
    throw new Error('No AI request has been made yet');
  }

  // Find system message in the request
  const systemMessage = lastRequest.messages.find(message => message.role === 'system');
  if (!systemMessage) {
    throw new Error('No system message found in the AI request');
  }

  if (!systemMessage.content || !systemMessage.content.includes(expectedPrompt)) {
    throw new Error(`Expected system prompt to contain "${expectedPrompt}", but got: "${systemMessage.content}"`);
  }
});

Then('the last AI request should have {int} messages', async function(this: ApplicationWorld, expectedCount: number) {
  if (!this.mockOpenAIServer) {
    throw new Error('Mock OpenAI server is not running');
  }

  const lastRequest = this.mockOpenAIServer.getLastRequest();
  if (!lastRequest) {
    throw new Error('No AI request has been made yet');
  }

  const actualCount = lastRequest.messages.length;
  if (actualCount !== expectedCount) {
    throw new Error(`Expected ${expectedCount} messages in the AI request, but got ${actualCount}`);
  }
});

// Shared provider config used across steps (kept at module scope for reuse)
const providerConfig: AIProviderConfig = {
  provider: 'TestProvider',
  baseURL: 'http://127.0.0.1:15121/v1',
  models: [
    { name: 'test-model', features: ['language'] },
    { name: 'test-embedding-model', features: ['language', 'embedding'] },
    { name: 'test-speech-model', features: ['speech'] },
  ],
  providerClass: 'openAICompatible',
  isPreset: false,
  enabled: true,
};

const desiredModelParameters = { temperature: 0.7, systemPrompt: 'You are a helpful assistant.', topP: 0.95 };

Given('I ensure test ai settings exists', function() {
  // Build expected aiSettings from shared providerConfig and compare with actual
  const modelsArray = providerConfig.models;
  const modelName = modelsArray[0]?.name;
  const providerName = providerConfig.provider;

  const parsed = fs.readJsonSync(settingsPath) as Record<string, unknown>;
  const actual = (parsed.aiSettings as Record<string, unknown> | undefined) || null;

  if (!actual) {
    throw new Error('aiSettings not found in settings file');
  }

  const actualProviders = (actual.providers as Array<Record<string, unknown>>) || [];

  // Check TestProvider exists
  const testProvider = actualProviders.find(p => p.provider === providerName);
  if (!testProvider) {
    console.error('TestProvider not found in actual providers:', JSON.stringify(actualProviders, null, 2));
    throw new Error('TestProvider not found in aiSettings');
  }

  // Verify TestProvider configuration
  if (!isEqual(testProvider, providerConfig)) {
    console.error('TestProvider config mismatch. expected:', JSON.stringify(providerConfig, null, 2));
    console.error('TestProvider config actual:', JSON.stringify(testProvider, null, 2));
    throw new Error('TestProvider configuration does not match expected');
  }

  // Check ComfyUI provider exists
  const comfyuiProvider = actualProviders.find(p => p.provider === 'comfyui');
  if (!comfyuiProvider) {
    console.error('ComfyUI provider not found in actual providers:', JSON.stringify(actualProviders, null, 2));
    throw new Error('ComfyUI provider not found in aiSettings');
  }

  // Verify ComfyUI has test-flux model with workflow path
  const comfyuiModels = (comfyuiProvider.models as Array<Record<string, unknown>>) || [];
  const testFluxModel = comfyuiModels.find(m => m.name === 'test-flux');
  if (!testFluxModel) {
    console.error('test-flux model not found in ComfyUI models:', JSON.stringify(comfyuiModels, null, 2));
    throw new Error('test-flux model not found in ComfyUI provider');
  }

  // Verify workflow path
  const parameters = testFluxModel.parameters as Record<string, unknown> | undefined;
  if (!parameters || parameters.workflowPath !== 'C:/test/mock/workflow.json') {
    console.error('Workflow path mismatch. expected: C:/test/mock/workflow.json, actual:', parameters?.workflowPath);
    throw new Error('Workflow path not correctly saved');
  }

  // Verify default config
  const defaultConfig = actual.defaultConfig as Record<string, unknown>;
  const api = defaultConfig.api as Record<string, unknown>;
  if (api.provider !== providerName || api.model !== modelName) {
    console.error('Default config mismatch. expected provider:', providerName, 'model:', modelName);
    console.error('actual api:', JSON.stringify(api, null, 2));
    throw new Error('Default configuration does not match expected');
  }
});

// Version without datatable for simple cases
Given('I add test ai settings', async function(this: ApplicationWorld) {
  let existing = {} as ISettingFile;
  if (fs.existsSync(settingsPath)) {
    existing = fs.readJsonSync(settingsPath) as ISettingFile;
  } else {
    fs.ensureDirSync(path.dirname(settingsPath));
  }
  const modelsArray = providerConfig.models;
  const modelName = modelsArray[0]?.name;
  const embeddingModelName = modelsArray[1]?.name;
  const speechModelName = modelsArray[2]?.name;

  const newAi: AIGlobalSettings = {
    providers: [providerConfig],
    defaultConfig: {
      api: {
        provider: providerConfig.provider,
        model: modelName,
        embeddingModel: embeddingModelName,
        speechModel: speechModelName,
      },
      modelParameters: desiredModelParameters,
    },
  };

  const newPreferences = existing.preferences || {};

  fs.writeJsonSync(settingsPath, { ...existing, aiSettings: newAi, preferences: newPreferences } as ISettingFile, { spaces: 2 });
});

// Version with datatable for advanced configuration
Given('I add test ai settings:', async function(this: ApplicationWorld, dataTable: DataTable) {
  let existing = {} as ISettingFile;
  if (fs.existsSync(settingsPath)) {
    existing = fs.readJsonSync(settingsPath) as ISettingFile;
  } else {
    fs.ensureDirSync(path.dirname(settingsPath));
  }
  const modelsArray = providerConfig.models;
  const modelName = modelsArray[0]?.name;
  const embeddingModelName = modelsArray[1]?.name;
  const speechModelName = modelsArray[2]?.name;

  // Parse options from data table
  let summaryModel: string | undefined;
  let aiGenerateBackupTitle: boolean | undefined;
  let aiGenerateBackupTitleTimeout: number | undefined;

  if (dataTable && typeof dataTable.raw === 'function') {
    const rows = dataTable.raw();
    // Process all rows as key-value pairs (no header row)
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const key = (row[0] ?? '').trim();
      const value = (row[1] ?? '').trim();

      if (key === 'summaryModel') {
        // If value is 'true', enable summaryModel using the same model as main model
        if (value === 'true') {
          summaryModel = modelName;
        }
      } else if (key === 'aiGenerateBackupTitle') {
        aiGenerateBackupTitle = value === 'true';
      } else if (key === 'aiGenerateBackupTitleTimeout') {
        aiGenerateBackupTitleTimeout = Number.parseInt(value, 10);
      }
    }
  }

  const newAi: AIGlobalSettings = {
    providers: [providerConfig],
    defaultConfig: {
      api: {
        provider: providerConfig.provider,
        model: modelName,
        embeddingModel: embeddingModelName,
        speechModel: speechModelName,
        ...(summaryModel ? { summaryModel } : {}),
      },
      modelParameters: desiredModelParameters,
    },
  };

  const newPreferences = {
    ...(existing.preferences || {}),
    ...(aiGenerateBackupTitle !== undefined ? { aiGenerateBackupTitle } : {}),
    ...(aiGenerateBackupTitleTimeout !== undefined ? { aiGenerateBackupTitleTimeout } : {}),
  };

  fs.writeJsonSync(settingsPath, { ...existing, aiSettings: newAi, preferences: newPreferences } as ISettingFile, { spaces: 2 });
});

async function clearAISettings() {
  if (!(await fs.pathExists(settingsPath))) return;
  const parsed = await fs.readJson(settingsPath) as ISettingFile;
  const cleaned = omit(parsed, ['aiSettings']);
  await fs.writeJson(settingsPath, cleaned, { spaces: 2 });
}

export { clearAISettings };
