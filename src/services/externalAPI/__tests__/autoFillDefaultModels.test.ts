import { container } from '@services/container';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { ModelAssignments, ProviderAccountConfig } from 'memeloop';
import { beforeEach, describe, expect, it } from 'vitest';

const providerId = 'canonical-autofill-test';
const existingProviderId = 'canonical-existing-test';
const account: ProviderAccountConfig = {
  providerId,
  providerType: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:15121/v1',
  models: [
    { modelId: 'assistant', wireModelId: 'vendor/assistant-v2', apiMode: 'chat-completions' },
    { modelId: 'embedding', wireModelId: 'vendor/embedding-v1', apiMode: 'chat-completions' },
  ],
  catalogProvider: {
    id: providerId,
    name: 'Canonical test provider',
    env: [],
    models: [
      {
        id: 'assistant',
        name: 'Assistant',
        attachment: false,
        reasoning: true,
        toolCall: true,
        modalities: { input: ['text'], output: ['text'] },
      },
      {
        id: 'embedding',
        name: 'Embedding',
        attachment: false,
        reasoning: false,
        toolCall: false,
        modalities: { input: ['text'], output: ['text'] },
      },
    ],
  },
};

describe('ExternalAPIService canonical model auto-fill', () => {
  let service: IExternalAPIService;

  beforeEach(async () => {
    service = container.get<IExternalAPIService>(serviceIdentifier.ExternalAPI);
    await service.deleteProviderAccount(providerId);
    await service.deleteProviderAccount(existingProviderId);
    await service.updateDefaultAIConfig({});
  });

  it('publishes exact provider accounts on providerAccounts$', async () => {
    const emitted: ProviderAccountConfig[][] = [];
    const subscription = service.providerAccounts$.subscribe(accounts => emitted.push(accounts));

    await service.setProviderAccount(account);

    expect(emitted.at(-1)).toEqual([expect.objectContaining({
      providerId,
      providerType: 'openai-compatible',
      models: account.models,
    })]);
    subscription.unsubscribe();
  });

  it('fills empty language and embedding assignments from catalog capabilities', async () => {
    const emitted: ModelAssignments[] = [];
    const subscription = service.defaultConfig$.subscribe(assignments => emitted.push(assignments));

    await service.setProviderAccount(account);

    expect(emitted.at(-1)).toMatchObject({
      default: { providerId, modelId: 'assistant' },
      free: { providerId, modelId: 'assistant' },
      embedding: { providerId, modelId: 'embedding' },
    });
    subscription.unsubscribe();
  });

  it('does not overwrite an explicit canonical assignment', async () => {
    await service.setProviderAccount({
      providerId: existingProviderId,
      providerType: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:15122/v1',
      models: [{ modelId: 'existing-model', wireModelId: 'vendor/existing', apiMode: 'chat-completions' }],
    });
    await service.updateDefaultAIConfig({
      default: {
        providerId: existingProviderId,
        modelId: 'existing-model',
        parameters: { temperature: 0.2, reasoningEffort: 'medium' },
      },
    });

    await service.setProviderAccount(account);

    expect(await service.getAIConfig()).toMatchObject({
      default: {
        providerId: existingProviderId,
        modelId: 'existing-model',
        parameters: { temperature: 0.2, reasoningEffort: 'medium' },
      },
    });
  });
});
