import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MODEL_CATALOG_SOURCE_URL, type ModelAssignments, type ModelCatalogProvider, type ModelCatalogResolution, type ProviderAccountConfig } from 'memeloop';
import { createRef } from 'react';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExternalAPI } from '../index';

const catalogProvider: ModelCatalogProvider = {
  id: 'openai-main',
  name: 'OpenAI Main',
  npm: '@ai-sdk/openai',
  api: 'https://api.openai.com/v1',
  env: ['OPENAI_API_KEY'],
  models: [
    {
      id: 'reasoning',
      name: 'Reasoning model',
      attachment: true,
      reasoning: true,
      toolCall: true,
      modalities: { input: ['text', 'image'], output: ['text'] },
    },
    {
      id: 'text-embedding-3-small',
      name: 'Embedding model',
      attachment: false,
      reasoning: false,
      toolCall: false,
      modalities: { input: ['text'], output: ['embedding'] },
    },
  ],
};

const catalogResolution: ModelCatalogResolution = {
  catalog: {
    schemaVersion: 1,
    source: MODEL_CATALOG_SOURCE_URL,
    catalogVersion: 'test-catalog',
    fetchedAt: '2026-08-31T00:00:00.000Z',
    providers: [catalogProvider],
  },
  source: 'embedded',
  stale: false,
};

describe('ExternalAPI provider-account integration', () => {
  let setProviderAccount: ReturnType<typeof vi.fn<(account: ProviderAccountConfig) => Promise<void>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    const assignments: ModelAssignments = {};
    setProviderAccount = vi.fn().mockResolvedValue(undefined);
    Object.defineProperties(window.service.externalAPI, {
      getAIConfig: { value: vi.fn().mockResolvedValue(assignments), writable: true },
      getProviderAccounts: { value: vi.fn().mockResolvedValue([]), writable: true },
      getProviderCatalog: { value: vi.fn().mockResolvedValue(catalogResolution), writable: true },
      setProviderAccount: { value: setProviderAccount, writable: true },
      getProviderApiKey: { value: vi.fn().mockResolvedValue(''), writable: true },
    });
    Object.defineProperty(window.observables, 'externalAPI', {
      value: {
        defaultConfig$: new BehaviorSubject(assignments),
        providerAccounts$: new BehaviorSubject<ProviderAccountConfig[]>([]),
      },
      writable: true,
    });
  });

  function renderSection() {
    return render(
      <ThemeProvider theme={lightTheme}>
        <ExternalAPI sectionRef={createRef()} onNeedsRestart={vi.fn()} />
      </ThemeProvider>,
    );
  }

  it('adds a custom account through the canonical provider API', async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.queryByText('Loading')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Preference.AddNewProvider' }));
    await user.type(screen.getByTestId('new-provider-name-input'), '0remote');
    await user.type(screen.getByTestId('new-provider-base-url-input'), 'https://models.example.test/v1');
    await user.click(screen.getByTestId('add-provider-submit-button'));

    await waitFor(() => {
      expect(setProviderAccount).toHaveBeenCalledWith({
        providerId: '0remote',
        providerType: 'openai-compatible',
        baseUrl: 'https://models.example.test/v1',
        enabled: true,
        models: [],
      });
    });
  });

  it('exposes the exact catalog provider for account creation', async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.queryByText('Loading')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Preference.AddNewProvider' }));
    await user.click(within(screen.getByTestId('new-provider-preset-select')).getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'OpenAI Main' })).toHaveAttribute('data-value', 'openai-main');
  });
});
