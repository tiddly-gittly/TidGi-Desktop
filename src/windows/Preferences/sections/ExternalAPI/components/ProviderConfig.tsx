import AddIcon from '@mui/icons-material/Add';
import { Alert, Button, FormControl, InputLabel, MenuItem, Select, Snackbar } from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  isProviderId,
  type ModelCatalogModel,
  type ModelCatalogProvider,
  normalizeProviderAccountConfig,
  PROVIDER_ID_MAX_UTF8_BYTES,
  type ProviderAccountConfig,
  type ProviderModelRoute,
} from 'memeloop';
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemVertical } from '../../../PreferenceComponents';
import { NewModelDialog } from './NewModelDialog';
import { NewProviderForm } from './NewProviderForm';
import { ProviderPanel } from './ProviderPanel';

interface ProviderConfigProps {
  accounts: ProviderAccountConfig[];
  catalogProviders?: ModelCatalogProvider[];
  setAccounts: Dispatch<SetStateAction<ProviderAccountConfig[]>>;
  focusTarget?: {
    providerId: string;
    modelId?: string;
    field: 'apiKey' | 'baseUrl' | 'model' | 'apiMode';
  };
}

const EMPTY_CATALOG_PROVIDERS: ModelCatalogProvider[] = [];
const AddProviderButton = styled(Button)`
  margin-top: 16px;
  margin-bottom: 8px;
  width: 100%;
`;

export function ProviderConfig({
  accounts,
  catalogProviders = EMPTY_CATALOG_PROVIDERS,
  setAccounts,
  focusTarget,
}: ProviderConfigProps) {
  const { t } = useTranslation('agent');
  const [selectedProviderId, setSelectedProviderId] = useState(accounts[0]?.providerId ?? '');
  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [newProviderForm, setNewProviderForm] = useState({ providerId: '', providerType: 'openai-compatible', baseUrl: '' });
  const [selectedCatalogProviderId, setSelectedCatalogProviderId] = useState('');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [refreshingProvider, setRefreshingProvider] = useState<string>();
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string>();
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' | 'info' }>();

  const selectedAccount = accounts.find(account => account.providerId === selectedProviderId);
  useEffect(() => {
    if (focusTarget && accounts.some(account => account.providerId === focusTarget.providerId)) {
      setSelectedProviderId(focusTarget.providerId);
    } else if (!accounts.some(account => account.providerId === selectedProviderId)) {
      setSelectedProviderId(accounts[0]?.providerId ?? '');
    }
  }, [accounts, focusTarget, selectedProviderId]);
  useEffect(() => {
    setBaseUrls(Object.fromEntries(accounts.map(account => [account.providerId, account.baseUrl ?? ''])));
  }, [accounts]);
  useEffect(() => {
    if (!selectedAccount?.secretRef) return;
    let active = true;
    void window.service.externalAPI.getProviderApiKey(selectedAccount.providerId).then(apiKey => {
      if (active) setApiKeys(current => ({ ...current, [selectedAccount.providerId]: apiKey }));
    }).catch((error: unknown) => {
      void window.service.native.log('error', 'Failed to load provider credential', { error, providerId: selectedAccount.providerId });
    });
    return () => {
      active = false;
    };
  }, [selectedAccount?.providerId, selectedAccount?.secretRef]);

  const availableCatalogProviders = useMemo(() => {
    const configured = new Set(accounts.map(account => account.providerId));
    return catalogProviders.filter(provider => !configured.has(provider.id));
  }, [accounts, catalogProviders]);
  const providerTypes = useMemo(() =>
    [
      ...new Set([
        'openai-compatible',
        'openai',
        'anthropic',
        'google',
        'deepseek',
        'ollama',
        ...catalogProviders.map(providerTypeFromCatalog),
      ]),
    ].sort(), [catalogProviders]);

  const persistAccount = async (account: ProviderAccountConfig) => {
    const normalized = normalizeProviderAccountConfig(account);
    await window.service.externalAPI.setProviderAccount(normalized);
    setAccounts(current => {
      const index = current.findIndex(candidate => candidate.providerId === normalized.providerId);
      return index < 0
        ? [...current, normalized]
        : current.map((candidate, candidateIndex) => candidateIndex === index ? normalized : candidate);
    });
    return normalized;
  };

  const addProvider = async () => {
    const providerId = newProviderForm.providerId.trim();
    if (!isProviderId(providerId) || new TextEncoder().encode(providerId).byteLength > PROVIDER_ID_MAX_UTF8_BYTES) {
      setSnackbar({
        message: t('Preference.ProviderIdInvalid', { maxBytes: PROVIDER_ID_MAX_UTF8_BYTES }),
        severity: 'error',
      });
      return;
    }
    if (accounts.some(account => account.providerId === providerId)) {
      setSnackbar({ message: t('Preference.ProviderAlreadyExists'), severity: 'error' });
      return;
    }
    const catalogProvider = catalogProviders.find(provider => provider.id === selectedCatalogProviderId);
    try {
      const account = await persistAccount({
        providerId,
        providerType: newProviderForm.providerType,
        enabled: true,
        models: catalogProvider?.models.map(model => ({
          modelId: model.id,
          wireModelId: model.id,
          apiMode: newProviderForm.providerType === 'openai' ? 'responses' : 'chat-completions',
        })) ?? [],
        ...(newProviderForm.baseUrl.trim() ? { baseUrl: newProviderForm.baseUrl.trim() } : {}),
        ...(catalogProvider ? { catalogProvider: { ...catalogProvider, id: providerId } } : {}),
      });
      setSelectedProviderId(account.providerId);
      setShowAddProviderForm(false);
      setSelectedCatalogProviderId('');
      setNewProviderForm({ providerId: '', providerType: 'openai-compatible', baseUrl: '' });
      setSnackbar({ message: t('Preference.ProviderAdded'), severity: 'success' });
    } catch (error) {
      setSnackbar({ message: error instanceof Error ? error.message : String(error), severity: 'error' });
    }
  };

  const selectCatalogProvider = (providerId: string) => {
    setSelectedCatalogProviderId(providerId);
    const provider = catalogProviders.find(candidate => candidate.id === providerId);
    if (!provider) return;
    setNewProviderForm({
      providerId: provider.id,
      providerType: providerTypeFromCatalog(provider),
      baseUrl: provider.api ?? '',
    });
  };

  const updateSelectedAccount = async (updates: Partial<ProviderAccountConfig>) => {
    if (!selectedAccount) return;
    await persistAccount({ ...selectedAccount, ...updates });
  };

  const runMutation = (operation: () => Promise<void>) => {
    void operation().catch((error: unknown) => {
      setSnackbar({ message: error instanceof Error ? error.message : String(error), severity: 'error' });
    });
  };

  const removeModel = async (modelId: string) => {
    if (!selectedAccount) return;
    await updateSelectedAccount({ models: selectedAccount.models.filter(route => route.modelId !== modelId) });
  };
  const saveModel = async (route: ProviderModelRoute, model: ModelCatalogModel) => {
    if (!selectedAccount) return;
    try {
      const previousRoute = editingModelId
        ? selectedAccount.models.find(candidate => candidate.modelId === editingModelId)
        : undefined;
      const routes = selectedAccount.models.filter(candidate => candidate.modelId !== previousRoute?.modelId);
      routes.push(route);
      const catalogProvider = selectedAccount.catalogProvider ?? {
        id: selectedAccount.providerId,
        name: selectedAccount.providerId,
        env: [],
        models: [],
      };
      const previousCatalogIds = new Set([previousRoute?.modelId, previousRoute?.wireModelId].filter(Boolean));
      await updateSelectedAccount({
        models: routes,
        catalogProvider: {
          ...catalogProvider,
          models: [
            ...catalogProvider.models.filter(candidate => !previousCatalogIds.has(candidate.id) && candidate.id !== model.id),
            model,
          ],
        },
      });
      setModelDialogOpen(false);
      setEditingModelId(undefined);
    } catch (error) {
      setSnackbar({ message: error instanceof Error ? error.message : String(error), severity: 'error' });
    }
  };

  const refreshModels = async () => {
    if (!selectedAccount) return;
    setRefreshingProvider(selectedAccount.providerId);
    try {
      const updated = await window.service.externalAPI.refreshProviderAccountModels(selectedAccount.providerId);
      setAccounts(current => current.map(account => account.providerId === updated.providerId ? updated : account));
    } catch (error) {
      setSnackbar({ message: error instanceof Error ? error.message : String(error), severity: 'error' });
    } finally {
      setRefreshingProvider(undefined);
    }
  };

  const deleteProvider = async () => {
    if (!selectedAccount) return;
    await window.service.externalAPI.deleteProviderAccount(selectedAccount.providerId);
    setAccounts(current => current.filter(account => account.providerId !== selectedAccount.providerId));
  };

  const editedRoute = selectedAccount?.models.find(route => route.modelId === editingModelId);
  const editedModel = editedRoute && selectedAccount?.catalogProvider?.models.find(model => model.id === editedRoute.modelId || model.id === editedRoute.wireModelId);

  return (
    <ListItemVertical>
      {accounts.length > 0 && (
        <FormControl fullWidth margin='normal'>
          <InputLabel id='configured-provider-label'>{t('Preference.ConfigureProvider', { provider: '' })}</InputLabel>
          <Select
            labelId='configured-provider-label'
            value={selectedProviderId}
            label={t('Preference.ConfigureProvider', { provider: '' })}
            onChange={event => {
              setSelectedProviderId(event.target.value);
            }}
          >
            {accounts.map(account => (
              <MenuItem key={account.providerId} value={account.providerId}>
                {account.catalogProvider?.name ?? account.providerId}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      {selectedAccount && (
        <ProviderPanel
          account={selectedAccount}
          apiKey={apiKeys[selectedAccount.providerId] ?? ''}
          baseUrl={baseUrls[selectedAccount.providerId] ?? selectedAccount.baseUrl ?? ''}
          onFormChange={(field, value) => {
            if (field === 'apiKey') setApiKeys(current => ({ ...current, [selectedAccount.providerId]: value }));
            else setBaseUrls(current => ({ ...current, [selectedAccount.providerId]: value }));
          }}
          onFieldCommit={field => {
            if (field === 'apiKey') {
              runMutation(() =>
                window.service.externalAPI.setProviderApiKey(
                  selectedAccount.providerId,
                  apiKeys[selectedAccount.providerId] ?? '',
                )
              );
            } else {
              runMutation(() => updateSelectedAccount({ baseUrl: baseUrls[selectedAccount.providerId] || undefined }));
            }
          }}
          onEnabledChange={enabled => {
            runMutation(() => updateSelectedAccount({ enabled }));
          }}
          onRemoveModel={modelId => {
            runMutation(() => removeModel(modelId));
          }}
          onEditModel={modelId => {
            setEditingModelId(modelId);
            setModelDialogOpen(true);
          }}
          onOpenAddModelDialog={() => {
            setEditingModelId(undefined);
            setModelDialogOpen(true);
          }}
          onDeleteProvider={() => {
            runMutation(deleteProvider);
          }}
          onRefreshModels={() => {
            runMutation(refreshModels);
          }}
          refreshingModels={refreshingProvider === selectedAccount.providerId}
          focusField={focusTarget?.providerId === selectedAccount.providerId ? focusTarget.field : undefined}
          focusModelId={focusTarget?.providerId === selectedAccount.providerId ? focusTarget.modelId : undefined}
        />
      )}
      {showAddProviderForm
        ? (
          <NewProviderForm
            formState={newProviderForm}
            providerTypes={providerTypes}
            availableCatalogProviders={availableCatalogProviders}
            selectedCatalogProviderId={selectedCatalogProviderId}
            onCatalogProviderSelect={selectCatalogProvider}
            onChange={updates => {
              setNewProviderForm(current => ({ ...current, ...updates }));
            }}
            onSubmit={() => void addProvider()}
          />
        )
        : (
          <AddProviderButton
            variant='outlined'
            startIcon={<AddIcon />}
            onClick={() => {
              setShowAddProviderForm(true);
            }}
          >
            {t('Preference.AddNewProvider')}
          </AddProviderButton>
        )}
      <NewModelDialog
        open={modelDialogOpen}
        route={editedRoute}
        model={editedModel}
        onClose={() => {
          setModelDialogOpen(false);
        }}
        onSave={(route, model) => void saveModel(route, model)}
      />
      <Snackbar
        open={snackbar !== undefined}
        autoHideDuration={5000}
        onClose={() => {
          setSnackbar(undefined);
        }}
      >
        {snackbar && <Alert severity={snackbar.severity}>{snackbar.message}</Alert>}
      </Snackbar>
    </ListItemVertical>
  );
}

function providerTypeFromCatalog(provider: ModelCatalogProvider): string {
  switch (provider.npm) {
    case '@ai-sdk/openai':
      return 'openai';
    case '@ai-sdk/anthropic':
      return 'anthropic';
    case '@ai-sdk/google':
      return 'google';
    case '@ai-sdk/deepseek':
      return 'deepseek';
    default:
      return 'openai-compatible';
  }
}
