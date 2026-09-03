import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { render, screen, waitFor } from '@testing-library/react';
import { MODEL_CATALOG_SOURCE_URL, type ModelAssignments, type ModelCatalogResolution, type ProviderAccountConfig } from 'memeloop';
import { createRef } from 'react';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExternalAPI } from '../index';

const account: ProviderAccountConfig = {
  providerId: 'openai-main',
  providerType: 'openai',
  secretRef: 'desktop-keychain:openai-main',
  enabled: true,
  models: [
    { modelId: 'reasoning', wireModelId: 'gpt-5.6', apiMode: 'responses' },
    { modelId: 'fast', wireModelId: 'gpt-5.6-mini', apiMode: 'responses' },
    { modelId: 'embedding', wireModelId: 'text-embedding-3-small', apiMode: 'chat-completions' },
    { modelId: 'speech', wireModelId: 'gpt-audio', apiMode: 'chat-completions' },
    { modelId: 'image', wireModelId: 'gpt-image', apiMode: 'chat-completions' },
    { modelId: 'transcription', wireModelId: 'whisper-1', apiMode: 'chat-completions' },
  ],
  catalogProvider: {
    id: 'openai-main',
    name: 'OpenAI Main',
    npm: '@ai-sdk/openai',
    api: 'https://api.openai.com/v1',
    env: ['OPENAI_API_KEY'],
    models: [
      catalogModel('reasoning', 'Reasoning model', ['text'], ['text']),
      catalogModel('fast', 'Fast model', ['text'], ['text']),
      catalogModel('embedding', 'Embedding model', ['text'], ['embedding']),
      catalogModel('speech', 'Speech model', ['text'], ['audio']),
      catalogModel('image', 'Image model', ['text'], ['image']),
      catalogModel('transcription', 'Transcription model', ['audio'], ['text']),
    ],
  },
};

const assignments: ModelAssignments = {
  default: { providerId: 'openai-main', modelId: 'reasoning', parameters: { temperature: 0.7 } },
  embedding: { providerId: 'openai-main', modelId: 'embedding' },
  speech: { providerId: 'openai-main', modelId: 'speech' },
  imageGeneration: { providerId: 'openai-main', modelId: 'image' },
  transcriptions: { providerId: 'openai-main', modelId: 'transcription' },
  free: { providerId: 'openai-main', modelId: 'fast' },
};

const catalogResolution: ModelCatalogResolution = {
  catalog: {
    schemaVersion: 1,
    source: MODEL_CATALOG_SOURCE_URL,
    catalogVersion: 'test-catalog',
    fetchedAt: '2026-08-31T00:00:00.000Z',
    providers: [account.catalogProvider!],
  },
  source: 'embedded',
  stale: false,
};

function catalogModel(id: string, name: string, input: string[], output: string[]) {
  return {
    id,
    name,
    attachment: input.includes('image'),
    reasoning: id === 'reasoning',
    toolCall: id === 'reasoning' || id === 'fast',
    modalities: { input, output },
  };
}

function renderExternalAPI() {
  return render(
    <ThemeProvider theme={lightTheme}>
      <ExternalAPI sectionRef={createRef()} onNeedsRestart={vi.fn()} />
    </ThemeProvider>,
  );
}

describe('ExternalAPI preferences section', () => {
  let getProviderCatalog: ReturnType<typeof vi.fn<(refresh?: boolean) => Promise<ModelCatalogResolution>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    getProviderCatalog = vi.fn().mockResolvedValue(catalogResolution);
    Object.defineProperties(window.service.externalAPI, {
      getAIConfig: { value: vi.fn().mockResolvedValue(assignments), writable: true },
      getProviderAccounts: { value: vi.fn().mockResolvedValue([account]), writable: true },
      getProviderCatalog: { value: getProviderCatalog, writable: true },
      getProviderApiKey: { value: vi.fn().mockResolvedValue(''), writable: true },
      updateDefaultAIConfig: { value: vi.fn().mockResolvedValue(undefined), writable: true },
      deleteFieldFromDefaultAIConfig: { value: vi.fn().mockResolvedValue(undefined), writable: true },
    });
    Object.defineProperty(window.observables, 'externalAPI', {
      value: {
        defaultConfig$: new BehaviorSubject(assignments),
        providerAccounts$: new BehaviorSubject([account]),
      },
      writable: true,
    });
  });

  it('renders every canonical model assignment from account routes', async () => {
    renderExternalAPI();
    await waitFor(() => expect(screen.queryByText('Loading')).not.toBeInTheDocument());

    expect(screen.getByText('Preference.DefaultAIModelSelection')).toBeInTheDocument();
    expect(screen.getByText('Preference.DefaultEmbeddingModelSelection')).toBeInTheDocument();
    expect(screen.getByText('Preference.DefaultSpeechModelSelection')).toBeInTheDocument();
    expect(screen.getByText('Preference.DefaultImageGenerationModelSelection')).toBeInTheDocument();
    expect(screen.getByText('Preference.DefaultTranscriptionsModelSelection')).toBeInTheDocument();
    expect(screen.getByText('Preference.DefaultFreeModelSelection')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Preference.SelectModel')).toHaveLength(6);
    expect(screen.getByDisplayValue('Reasoning model')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Embedding model')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('gpt-5.6')).not.toBeInTheDocument();
  });

  it('loads the exact catalog resolution locally and then refreshes it', async () => {
    renderExternalAPI();
    await waitFor(() => {
      expect(getProviderCatalog).toHaveBeenCalledTimes(2);
    });
    expect(getProviderCatalog).toHaveBeenNthCalledWith(1, false);
    expect(getProviderCatalog).toHaveBeenNthCalledWith(2, true);
  });

  it('renders a localized catalog loading failure instead of logging it only', async () => {
    getProviderCatalog.mockRejectedValueOnce(new Error('catalog unavailable'));
    renderExternalAPI();

    await waitFor(() => {
      expect(screen.getByText('Preference.FailedToLoadProviderCatalog')).toBeInTheDocument();
    });
  });
});
