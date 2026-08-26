import type { AIProviderConfig } from '@/services/externalAPI/interface';
import { PreferenceSections } from '@/services/preferences/interface';
import type { AgentDefinition, AgentFrameworkConfig, AgentModelConfig } from 'memeloop';
import { resolveWikiAgentId } from './agentDiscovery';

const MAX_AGENT_DEFINITIONS = 128;
const MAX_MODEL_OPTIONS = 512;

export interface WikiAgentDefinitionOption {
  id: string;
  label: string;
  description?: string;
}

export interface WikiAgentModelOption {
  id: string;
  providerId: string;
  modelId: string;
  label: string;
}

export interface WikiAgentModelSelection {
  selectedId?: string;
  options: readonly WikiAgentModelOption[];
}

/**
 * Narrow host boundary used by the example plugin. The React view does not
 * know about Electron IPC or Desktop settings storage and tests/other Wiki
 * hosts can inject a compatible adapter.
 */
export interface WikiAgentHostAdapter {
  isReady(): boolean;
  resolveAgentId(requestedAgentId: string | undefined, options: { signal: AbortSignal }): Promise<string>;
  listAgentDefinitions(options: { signal: AbortSignal }): Promise<readonly WikiAgentDefinitionOption[]>;
  createAgent(definitionId: string, options: { signal: AbortSignal }): Promise<{ id: string }>;
  getAgentDefinition(definitionId: string, options: { signal: AbortSignal }): Promise<AgentDefinition | undefined>;
  getAgentFrameworkConfig(agentId: string, definitionId: string, options: { signal: AbortSignal }): Promise<AgentFrameworkConfig | undefined>;
  getModelSelection(agentId: string, definitionId: string, options: { signal: AbortSignal }): Promise<WikiAgentModelSelection>;
  selectModel(agentId: string, option: WikiAgentModelOption, options: { signal: AbortSignal }): Promise<void>;
  openSettings(): Promise<void>;
  logError(message: string, error: unknown): void;
}

export class WikiAgentHostUnavailableError extends Error {
  readonly code = 'wiki_agent_host_unavailable';

  constructor() {
    super('MemeLoop Desktop host services are unavailable');
    this.name = 'WikiAgentHostUnavailableError';
  }
}

function serviceWindow(): typeof window.service | undefined {
  return typeof window === 'undefined' ? undefined : window.service;
}

function assertReady(): typeof window.service {
  const service = serviceWindow();
  if (
    !service?.agentDefinition || !service.agentInstance || !service.externalAPI ||
    !service.context || !service.deepLink || !service.deviceNetwork
  ) throw new WikiAgentHostUnavailableError();
  return service;
}

function assertPluginHostReady(): void {
  assertReady();
  const observables = typeof window === 'undefined'
    ? undefined
    : window.observables as unknown as Record<string, unknown> | undefined;
  if (!observables?.agentInstance || !observables.deviceNetwork || !observables.externalAPI) {
    throw new WikiAgentHostUnavailableError();
  }
}

function throwIfAborted(signal: AbortSignal): void {
  signal.throwIfAborted();
}

function boundedDefinitions(definitions: readonly AgentDefinition[]): WikiAgentDefinitionOption[] {
  const seen = new Set<string>();
  const result: WikiAgentDefinitionOption[] = [];
  for (const definition of definitions) {
    if (!definition.id || seen.has(definition.id)) continue;
    seen.add(definition.id);
    result.push({
      id: definition.id,
      label: definition.name || definition.id,
      ...(definition.description ? { description: definition.description } : {}),
    });
    if (result.length === MAX_AGENT_DEFINITIONS) break;
  }
  return result;
}

function modelOption(provider: AIProviderConfig, model: AIProviderConfig['models'][number]): WikiAgentModelOption {
  return {
    id: JSON.stringify([provider.provider, model.name]),
    providerId: provider.provider,
    modelId: model.name,
    label: `${provider.provider} · ${model.caption || model.name}`,
  };
}

function boundedModels(providers: readonly AIProviderConfig[]): WikiAgentModelOption[] {
  const seen = new Set<string>();
  const result: WikiAgentModelOption[] = [];
  for (const provider of providers) {
    if (provider.enabled === false || !provider.provider) continue;
    for (const model of provider.models ?? []) {
      if (!model.name) continue;
      const option = modelOption(provider, model);
      if (seen.has(option.id)) continue;
      seen.add(option.id);
      result.push(option);
      if (result.length === MAX_MODEL_OPTIONS) return result;
    }
  }
  return result;
}

async function resolvedModelConfig(agentId: string, definitionId: string): Promise<AgentModelConfig | undefined> {
  const service = assertReady();
  const instance = await service.agentInstance.getAgentMetadata(agentId);
  if (instance?.modelConfig) return instance.modelConfig;
  const definition = await service.agentDefinition.getAgentDef(instance?.agentDefId || definitionId);
  if (definition?.modelConfig) return definition.modelConfig;
  const globalConfig = await service.externalAPI.getAIConfig();
  return globalConfig.default
    ? { providerId: globalConfig.default.provider, modelId: globalConfig.default.model }
    : undefined;
}

export function createDesktopWikiAgentHostAdapter(): WikiAgentHostAdapter {
  return {
    isReady: () => {
      try {
        assertPluginHostReady();
        return true;
      } catch {
        return false;
      }
    },

    async resolveAgentId(requestedAgentId, { signal }) {
      throwIfAborted(signal);
      const agentId = await resolveWikiAgentId(requestedAgentId, assertReady().agentInstance);
      throwIfAborted(signal);
      return agentId;
    },

    async listAgentDefinitions({ signal }) {
      throwIfAborted(signal);
      const definitions = await assertReady().agentDefinition.getAgentDefs();
      throwIfAborted(signal);
      return boundedDefinitions(definitions);
    },

    async createAgent(definitionId, { signal }) {
      throwIfAborted(signal);
      const instance = await assertReady().agentInstance.createAgent(definitionId);
      throwIfAborted(signal);
      return { id: instance.id };
    },

    async getAgentDefinition(definitionId, { signal }) {
      throwIfAborted(signal);
      const definition = await assertReady().agentDefinition.getAgentDef(definitionId);
      throwIfAborted(signal);
      return definition;
    },

    async getAgentFrameworkConfig(agentId, definitionId, { signal }) {
      throwIfAborted(signal);
      const service = assertReady();
      const instance = await service.agentInstance.getAgentMetadata(agentId);
      throwIfAborted(signal);
      if (instance?.agentFrameworkConfig && Object.keys(instance.agentFrameworkConfig).length > 0) {
        return instance.agentFrameworkConfig;
      }
      const definition = await service.agentDefinition.getAgentDef(instance?.agentDefId || definitionId);
      throwIfAborted(signal);
      return definition?.agentFrameworkConfig;
    },

    async getModelSelection(agentId, definitionId, { signal }) {
      throwIfAborted(signal);
      const service = assertReady();
      const [providers, selection] = await Promise.all([
        service.externalAPI.getAIProviders(),
        resolvedModelConfig(agentId, definitionId),
      ]);
      throwIfAborted(signal);
      const options = boundedModels(providers);
      return {
        options,
        ...(selection === undefined
          ? {}
          : { selectedId: JSON.stringify([selection.providerId, selection.modelId]) }),
      };
    },

    async selectModel(agentId, option, { signal }) {
      throwIfAborted(signal);
      const service = assertReady();
      const instance = await service.agentInstance.getAgentMetadata(agentId);
      throwIfAborted(signal);
      if (!instance) throw new WikiAgentHostUnavailableError();
      const definition = instance.agentDefId
        ? await service.agentDefinition.getAgentDef(instance.agentDefId)
        : undefined;
      throwIfAborted(signal);
      await service.agentInstance.updateAgent(agentId, {
        modelConfig: {
          providerId: option.providerId,
          modelId: option.modelId,
          ...(instance.modelConfig?.parameters === undefined && definition?.modelConfig?.parameters === undefined
            ? {}
            : { parameters: instance.modelConfig?.parameters ?? definition?.modelConfig?.parameters }),
        },
      });
      throwIfAborted(signal);
    },

    async openSettings() {
      const service = assertReady();
      const isTestMode = await service.context.get('isTest');
      await service.deepLink.openDeepLink(
        `${isTestMode ? 'tidgi-test' : 'tidgi'}://preferences/${PreferenceSections.externalAPI}`,
      );
    },

    logError(message, error) {
      const native = serviceWindow()?.native;
      if (!native) return;
      void native.log('error', message, { error }).catch(() => undefined);
    },
  };
}

export const WIKI_AGENT_HOST_LIMITS = Object.freeze({
  agentDefinitions: MAX_AGENT_DEFINITIONS,
  modelOptions: MAX_MODEL_OPTIONS,
});
