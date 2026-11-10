import { logger } from '@services/libs/log';
import type { AgentModelParameters, ModelCatalogModel, PortableLlmRequest, ProviderAccountConfig, ProviderModelRoute } from 'memeloop';

function isOpenAICompatible(providerType: string): boolean {
  return providerType === 'openai-compatible' || providerType === 'openai';
}

export function resolveProviderModelRoute(
  account: ProviderAccountConfig,
  logicalModelId: string,
): ProviderModelRoute {
  const route = account.models.find(candidate => candidate.modelId === logicalModelId);
  if (!route) throw new Error(`Model route not found: ${account.providerId}/${logicalModelId}`);
  return route;
}

export function resolveProviderCatalogModel(
  account: ProviderAccountConfig,
  route: ProviderModelRoute,
): ModelCatalogModel | undefined {
  return account.catalogProvider?.models.find(model => model.id === route.modelId || model.id === route.wireModelId);
}

export function resolveModelRequestSettings(
  account: ProviderAccountConfig,
  model: ModelCatalogModel | undefined,
  parameters: AgentModelParameters,
): Pick<PortableLlmRequest, 'maxOutputTokens' | 'providerOptions' | 'temperature' | 'topP'> {
  const reasoningEffort = parameters.reasoningEffort;
  const providerOptions = reasoningEffort !== undefined &&
      isOpenAICompatible(account.providerType) && model?.reasoning !== false
    ? { openai: { reasoningEffort } }
    : undefined;
  const settings = {
    maxOutputTokens: parameters.maxOutputTokens ?? model?.limit?.output,
    providerOptions,
    temperature: parameters.temperature ?? 0.7,
    topP: parameters.topP,
  };
  logger.debug('Resolved canonical provider request settings', {
    providerId: account.providerId,
    maxOutputTokens: settings.maxOutputTokens,
    hasReasoningEffort: reasoningEffort !== undefined,
  });
  return settings;
}
