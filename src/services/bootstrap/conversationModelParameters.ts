import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '@services/agentInstance/interface';
import type { IExternalAPIService } from '@services/externalAPI/interface';
import {
  type AgentModelConfig,
  assertAgentModelConfig,
  type ConversationModelParameters,
  type ConversationModelParametersHost,
  type ModelCatalogModel,
  resolveAgentModelConfig,
} from 'memeloop';

interface Options {
  agentInstanceService: Pick<IAgentInstanceService, 'getAgentMetadata' | 'updateAgent'>;
  agentDefinitionService: Pick<IAgentDefinitionService, 'getAgentDef'>;
  externalAPIService: Pick<IExternalAPIService, 'getAIConfig' | 'getProviderAccounts'>;
}

/** Project only the public controls the catalog actually advertises. */
function publicModel(model?: ModelCatalogModel): ModelCatalogModel | undefined {
  if (!model) return undefined;
  return {
    id: model.id,
    name: model.name,
    attachment: model.attachment,
    reasoning: model.reasoning,
    toolCall: model.toolCall,
    ...(model.reasoningEfforts === undefined ? {} : { reasoningEfforts: [...model.reasoningEfforts] }),
    ...(model.temperature === undefined ? {} : { temperature: model.temperature }),
    ...(model.limit === undefined ? {} : {
      limit: {
        ...(model.limit.context === undefined ? {} : { context: model.limit.context }),
        ...(model.limit.input === undefined ? {} : { input: model.limit.input }),
        ...(model.limit.output === undefined ? {} : { output: model.limit.output }),
      },
    }),
  };
}

function assertParameterChange(current: ConversationModelParameters, selection: AgentModelConfig): void {
  assertAgentModelConfig(selection);
  if (selection.providerId !== current.selection.providerId || selection.modelId !== current.selection.modelId) {
    throw new Error('conversation_model_changed');
  }
  const parameters = selection.parameters ?? {};
  const previous = current.selection.parameters ?? {};
  const model = current.model;
  if (
    parameters.reasoningEffort !== undefined && parameters.reasoningEffort !== previous.reasoningEffort &&
    (!model?.reasoning || !model.reasoningEfforts?.includes(parameters.reasoningEffort))
  ) {
    throw new Error('conversation_model_reasoning_unsupported');
  }
  if (parameters.temperature !== undefined && parameters.temperature !== previous.temperature && model?.temperature !== true) {
    throw new Error('conversation_model_temperature_unsupported');
  }
  if (parameters.maxOutputTokens !== undefined && model?.limit?.output !== undefined && parameters.maxOutputTokens > model.limit.output) {
    throw new Error('conversation_model_output_limit');
  }
}

export function createDesktopConversationModelParameters(options: Options): ConversationModelParametersHost {
  const get = async (conversationId: string): Promise<ConversationModelParameters> => {
    const agent = await options.agentInstanceService.getAgentMetadata(conversationId);
    if (!agent) throw new Error('conversation_not_found');
    const [definition, assignments, accounts] = await Promise.all([
      options.agentDefinitionService.getAgentDef(agent.agentDefId),
      options.externalAPIService.getAIConfig(),
      options.externalAPIService.getProviderAccounts(),
    ]);
    const selection = resolveAgentModelConfig({
      definition: definition ?? {},
      instanceDelta: { modelConfig: agent.modelConfig },
      hostDefault: assignments.default,
    });
    const account = accounts.find(item => item.enabled !== false && item.providerId === selection.providerId);
    const route = account?.models.find(route => route.modelId === selection.modelId);
    const defaults = route?.requestDefaults;
    selection.parameters = {
      ...(defaults?.temperature === undefined ? {} : { temperature: defaults.temperature }),
      ...(defaults?.topP === undefined ? {} : { topP: defaults.topP }),
      ...(defaults?.maxOutputTokens === undefined ? {} : { maxOutputTokens: defaults.maxOutputTokens }),
      ...(defaults?.reasoningEffort === undefined ? {} : { reasoningEffort: defaults.reasoningEffort }),
      ...selection.parameters,
    };
    const model = publicModel(
      account?.catalogProvider?.models.find(item => item.id === selection.modelId) ??
        account?.catalogProvider?.models.find(item => item.id === route?.wireModelId),
    );
    return { selection, ...(model ? { model } : {}) };
  };
  return {
    get,
    set: async (conversationId, selection) => {
      const selected = structuredClone(selection);
      const current = await get(conversationId);
      assertParameterChange(current, selected);
      await options.agentInstanceService.updateAgent(conversationId, { modelConfig: selected });
      return get(conversationId);
    },
  };
}
