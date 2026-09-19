import { buildAgentRunErrorSettingsDeepLink } from '@/pages/Agent/adapters/openAgentRunErrorSettings';
import type {
  AgentDefinition,
  AgentFrameworkConfig,
  AgentInstanceClient,
  AgentModelConfig,
  AgentRunErrorSettingTarget,
  AgentSessionTarget,
  ModelCatalog,
  ProviderAccountConfig,
} from 'memeloop';

import { resolveWikiAgentId } from './agentDiscovery';

const MAX_AGENT_DEFINITIONS = 128;
const MAX_MODEL_OPTIONS = 512;

/**
 * Narrow host boundary used by the example plugin. The React view does not
 * know about Electron IPC or Desktop settings storage and tests/other Wiki
 * hosts can inject a compatible adapter.
 */
export interface WikiAgentHostAdapter {
  isReady(): boolean;
  resolveAgentTarget(requestedAgentId: string | undefined, options: { signal: AbortSignal }): Promise<AgentSessionTarget>;
  listAgentDefinitions(options: { signal: AbortSignal }): Promise<readonly AgentDefinition[]>;
  createAgent(definition: AgentDefinition, options: { signal: AbortSignal }): ReturnType<AgentInstanceClient['createAgent']>;
  getAgentDefinition(definitionId: string, options: { signal: AbortSignal }): Promise<AgentDefinition | undefined>;
  getAgentFrameworkConfig(agentId: string, definitionId: string, options: { signal: AbortSignal }): Promise<AgentFrameworkConfig | undefined>;
  getModelConfig(agentId: string, definitionId: string, options: { signal: AbortSignal }): Promise<AgentModelConfig | undefined>;
  listProviderAccounts(options: { signal: AbortSignal }): Promise<readonly ProviderAccountConfig[]>;
  getProviderCatalog(options: { signal: AbortSignal }): Promise<ModelCatalog>;
  selectModel(agentId: string, selection: AgentModelConfig, options: { signal: AbortSignal }): Promise<void>;
  /** Exact Core target when available; hosts without field focus may degrade to its section. */
  openSettings(target?: AgentRunErrorSettingTarget): Promise<void>;
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
    : window.observables;
  if (!observables?.agentInstance || !observables.deviceNetwork || !observables.externalAPI) {
    throw new WikiAgentHostUnavailableError();
  }
}

function throwIfAborted(signal: AbortSignal): void {
  signal.throwIfAborted();
}

function boundedDefinitions(definitions: readonly AgentDefinition[]): AgentDefinition[] {
  const seen = new Set<string>();
  const result: AgentDefinition[] = [];
  for (const definition of definitions) {
    if (!definition.id || seen.has(definition.id)) continue;
    seen.add(definition.id);
    result.push(definition);
    if (result.length === MAX_AGENT_DEFINITIONS) break;
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
    ? globalConfig.default
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

    async resolveAgentTarget(requestedAgentId, { signal }) {
      throwIfAborted(signal);
      const agentId = await resolveWikiAgentId(requestedAgentId, assertReady().agentInstance);
      throwIfAborted(signal);
      return { agentId, conversationId: agentId };
    },

    async listAgentDefinitions({ signal }) {
      throwIfAborted(signal);
      const definitions = await assertReady().agentDefinition.getAgentDefs();
      throwIfAborted(signal);
      return boundedDefinitions(definitions);
    },

    async createAgent(definition, { signal }) {
      throwIfAborted(signal);
      const instance = await assertReady().agentInstance.createAgent(definition.id);
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
      if (instance?.agentFrameworkConfig !== undefined) {
        return instance.agentFrameworkConfig;
      }
      const definition = await service.agentDefinition.getAgentDef(instance?.agentDefId || definitionId);
      throwIfAborted(signal);
      return definition?.agentFrameworkConfig;
    },

    async getModelConfig(agentId, definitionId, { signal }) {
      throwIfAborted(signal);
      const selection = await resolvedModelConfig(agentId, definitionId);
      throwIfAborted(signal);
      return selection;
    },

    async listProviderAccounts({ signal }) {
      throwIfAborted(signal);
      const accounts = await assertReady().externalAPI.getProviderAccounts();
      throwIfAborted(signal);
      return accounts;
    },

    async getProviderCatalog({ signal }) {
      throwIfAborted(signal);
      const resolution = await assertReady().externalAPI.getProviderCatalog();
      throwIfAborted(signal);
      return resolution.catalog;
    },

    async selectModel(agentId, selection, { signal }) {
      throwIfAborted(signal);
      const service = assertReady();
      const instance = await service.agentInstance.getAgentMetadata(agentId);
      throwIfAborted(signal);
      if (!instance) throw new WikiAgentHostUnavailableError();
      await service.agentInstance.updateAgent(agentId, {
        modelConfig: selection,
      });
      throwIfAborted(signal);
    },

    async openSettings(target) {
      const service = assertReady();
      const isTestMode = await service.context.get('isTest');
      await service.deepLink.openDeepLink(
        buildAgentRunErrorSettingsDeepLink(isTestMode ? 'tidgi-test' : 'tidgi', target),
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
