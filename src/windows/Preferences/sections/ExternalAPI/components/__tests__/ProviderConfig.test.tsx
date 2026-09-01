import type { DialogProps } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@services/theme/defaultTheme';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ModelCatalogProvider, ProviderAccountConfig } from 'memeloop';
import type { SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProviderConfig } from '../ProviderConfig';

vi.mock('@mui/material', async importOriginal => {
  const material = await importOriginal<typeof import('@mui/material')>();
  return {
    ...material,
    Dialog: ({ children, open }: Pick<DialogProps, 'children' | 'open'>) => open ? <div role='dialog'>{children}</div> : null,
  };
});

const catalogProvider: ModelCatalogProvider = {
  id: 'openai-main',
  name: 'OpenAI Main',
  npm: '@ai-sdk/openai',
  api: 'https://api.openai.com/v1',
  env: ['OPENAI_API_KEY'],
  models: [{
    id: 'reasoning',
    name: 'Reasoning model',
    attachment: true,
    reasoning: true,
    toolCall: true,
    modalities: { input: ['text', 'image'], output: ['text'] },
  }],
};

const account: ProviderAccountConfig = {
  providerId: 'openai-main',
  providerType: 'openai',
  secretRef: 'desktop-keychain:openai-main',
  enabled: true,
  models: [{ modelId: 'reasoning', wireModelId: 'gpt-5.6', apiMode: 'responses' }],
  catalogProvider,
};

function renderProviderConfig(
  accounts: ProviderAccountConfig[],
  setAccounts: (value: SetStateAction<ProviderAccountConfig[]>) => void,
  catalogProviders: ModelCatalogProvider[] = [],
  focusTarget?: { providerId: string; modelId?: string; field: 'apiKey' | 'baseUrl' | 'model' | 'apiMode' },
) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <ProviderConfig
        accounts={accounts}
        catalogProviders={catalogProviders}
        setAccounts={setAccounts}
        focusTarget={focusTarget}
      />
    </ThemeProvider>,
  );
}

describe('ProviderConfig', () => {
  let setAccounts: ReturnType<typeof vi.fn<(value: SetStateAction<ProviderAccountConfig[]>) => void>>;
  let setProviderAccount: ReturnType<typeof vi.fn<(value: ProviderAccountConfig) => Promise<void>>>;
  let deleteProviderAccount: ReturnType<typeof vi.fn<(providerId: string) => Promise<void>>>;
  let getProviderApiKey: ReturnType<typeof vi.fn<(providerId: string) => Promise<string>>>;
  let setProviderApiKey: ReturnType<typeof vi.fn<(providerId: string, apiKey: string) => Promise<void>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    setAccounts = vi.fn();
    setProviderAccount = vi.fn().mockResolvedValue(undefined);
    deleteProviderAccount = vi.fn().mockResolvedValue(undefined);
    getProviderApiKey = vi.fn().mockResolvedValue('sk-decrypted-test');
    setProviderApiKey = vi.fn().mockResolvedValue(undefined);
    Object.defineProperties(window.service.externalAPI, {
      setProviderAccount: { value: setProviderAccount, writable: true },
      deleteProviderAccount: { value: deleteProviderAccount, writable: true },
      getProviderApiKey: { value: getProviderApiKey, writable: true },
      setProviderApiKey: { value: setProviderApiKey, writable: true },
      refreshProviderAccountModels: { value: vi.fn().mockResolvedValue(account), writable: true },
    });
  });

  it('renders exact account routes and reveals the separately stored credential', async () => {
    renderProviderConfig([account], setAccounts);

    expect(screen.getByText('OpenAI Main')).toBeInTheDocument();
    expect(screen.getByTestId('model-chip-reasoning')).toHaveTextContent('Reasoning model');
    await waitFor(() => expect(screen.getByTestId('provider-api-key-input')).toHaveValue('sk-decrypted-test'));
    expect(screen.getByTestId('provider-api-key-input')).toHaveAttribute('type', 'text');
    expect(getProviderApiKey).toHaveBeenCalledWith('openai-main');
  });

  it('focuses the exact missing API key control selected by the deep-link metadata', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    renderProviderConfig([account], setAccounts, [], { providerId: 'openai-main', field: 'apiKey' });

    const apiKeyInput = await screen.findByTestId('provider-api-key-input');
    await waitFor(() => expect(apiKeyInput).toHaveFocus());
  });

  it('persists a credential through the credential API without adding it to the account', async () => {
    const user = userEvent.setup();
    renderProviderConfig([account], setAccounts);
    const input = await screen.findByTestId('provider-api-key-input');

    await user.clear(input);
    await user.type(input, 'sk-replacement');
    await user.tab();

    await waitFor(() => {
      expect(setProviderApiKey).toHaveBeenCalledWith('openai-main', 'sk-replacement');
    });
    expect(setProviderAccount).not.toHaveBeenCalled();
  });

  it('deletes by canonical providerId and updates local account state', async () => {
    const user = userEvent.setup();
    renderProviderConfig([account], setAccounts);
    await user.click(screen.getByTestId('delete-provider-button'));

    await waitFor(() => {
      expect(deleteProviderAccount).toHaveBeenCalledWith('openai-main');
    });
    const updater = setAccounts.mock.calls.at(-1)?.[0];
    expect(typeof updater).toBe('function');
    if (typeof updater === 'function') expect(updater([account])).toEqual([]);
  });

  it.each(['0提供方', '提供方'])('adds a valid canonical provider id: %s', async providerId => {
    const user = userEvent.setup();
    renderProviderConfig([], setAccounts);

    await user.click(screen.getByRole('button', { name: 'Preference.AddNewProvider' }));
    await user.type(screen.getByTestId('new-provider-name-input'), providerId);
    await user.type(screen.getByTestId('new-provider-base-url-input'), 'https://models.example.test/v1');
    await user.click(screen.getByTestId('add-provider-submit-button'));

    await waitFor(() => {
      expect(setProviderAccount).toHaveBeenCalledWith({
        providerId,
        providerType: 'openai-compatible',
        baseUrl: 'https://models.example.test/v1',
        enabled: true,
        models: [],
      });
    });
  });

  it('persists Unicode logical and wire model ids without exchanging them', async () => {
    const user = userEvent.setup();
    renderProviderConfig([account], setAccounts);
    await user.click(screen.getByTestId('add-new-model-button'));

    const logicalInput = await screen.findByTestId('new-model-name-input');
    await user.click(logicalInput);
    await user.type(logicalInput, '模型2');
    await user.type(screen.getByLabelText('Preference.WireModelId'), '供应商/模型2:latest');
    await user.type(screen.getByLabelText('Preference.ModelCaption'), '模型 2');
    await user.click(screen.getByTestId('save-new-model-button'));

    await waitFor(() => {
      expect(setProviderAccount).toHaveBeenCalledWith(expect.objectContaining({
        providerId: 'openai-main',
        models: expect.arrayContaining([
          { modelId: '模型2', wireModelId: '供应商/模型2:latest', apiMode: 'chat-completions' },
        ]),
      }));
    });
  });

  it('offers exact catalog providers without a local provider projection', async () => {
    const user = userEvent.setup();
    renderProviderConfig([], setAccounts, [catalogProvider]);

    await user.click(screen.getByRole('button', { name: 'Preference.AddNewProvider' }));
    await user.click(within(screen.getByTestId('new-provider-preset-select')).getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'OpenAI Main' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'OpenAI Main' })).toHaveAttribute('data-value', 'openai-main');
  });
});
