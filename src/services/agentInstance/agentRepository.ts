/** Agent instance lifecycle and metadata persistence. */
import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { withAgentTransaction } from '@services/database/agentTransaction';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity, ScheduledTaskEntity } from '@services/database/schema/agent';
import {
  AgentLoopCheckpointEntity,
  AgentRunStateEntity,
  ConversationAttachmentReferenceEntity,
  ConversationEventEntity,
  ConversationEventSequenceEntity,
  ConversationMessageDetailEntity,
  ConversationMetadataFieldEntity,
  ConversationTimelineEntryEntity,
  ConversationTimelineRankCheckpointEntity,
  ConversationTimelineStateEntity,
  ConversationTurnTombstoneEntity,
} from '@services/database/schema/conversationEvent';
import { logger } from '@services/libs/log';
import { backOff } from 'exponential-backoff';
import { pick } from 'lodash';
import type { AgentInstanceMetadata, AgentInstanceMetadataUpdate } from 'memeloop';
import { createAgentInstanceFromDefinition } from 'memeloop';
import { DataSource, Repository } from 'typeorm';
import { bumpConversationListRevision } from './conversationStorageUtilities';

function containsAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export async function createAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  agentDefinitionService: IAgentDefinitionService,
  agentDefinitionID?: string,
  options?: { id?: string; preview?: boolean; volatile?: boolean },
): Promise<AgentInstanceMetadata> {
  // Get agent definition with exponential backoff to handle initialization race conditions
  const agentDefinition = await backOff(
    async () => {
      const definition = await agentDefinitionService.getAgentDef(agentDefinitionID);
      if (!definition) {
        throw new Error(`Agent definition not found: ${agentDefinitionID}`);
      }
      return definition;
    },
    {
      numOfAttempts: 3,
      startingDelay: 300,
      timeMultiple: 1.5,
    },
  );

  if (!agentDefinition.name) {
    throw new Error(`Agent definition missing required field 'name': ${agentDefinitionID}`);
  }

  const now = new Date();
  const instanceId = options?.id ?? crypto.randomUUID();
  if (!instanceId || Buffer.byteLength(instanceId, 'utf8') > 512 || containsAsciiControl(instanceId)) {
    throw new Error('invalid agent instance id');
  }
  const instanceData = createAgentInstanceFromDefinition(agentDefinition, {
    id: instanceId,
    volatile: options?.preview || options?.volatile || false,
  });

  const instanceEntity = agentInstanceRepo.create({
    id: instanceData.id,
    agentDefId: instanceData.agentDefId,
    name: instanceData.name,
    status: instanceData.status,
    created: now,
    modified: now,
    modelConfig: instanceData.modelConfig,
    avatarUrl: instanceData.avatarUrl,
    agentFrameworkConfig: instanceData.agentFrameworkConfig,
    closed: instanceData.closed ?? false,
    volatile: instanceData.volatile ?? false,
    preview: options?.preview === true,
  });

  // Add timeout to database save operation
  const savePromise = agentInstanceRepo.save(instanceEntity);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Database save timeout after 5 seconds'));
    }, 5000);
  });
  await Promise.race([savePromise, timeoutPromise]);

  logger.info('Created agent instance', {
    function: 'createAgent',
    instanceId,
    preview: !!options?.preview,
    volatile: !!options?.volatile || !!options?.preview,
  });

  return projectAgentInstanceMetadata(instanceEntity);
}

export async function getAgentMetadata(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  agentId: string,
): Promise<AgentInstanceMetadata | undefined> {
  const instanceEntity = await agentInstanceRepo.findOne({ where: { id: agentId } });
  if (!instanceEntity) return undefined;
  return projectAgentInstanceMetadata(instanceEntity);
}

function projectAgentInstanceMetadata(entity: AgentInstanceEntity): AgentInstanceMetadata {
  return {
    id: entity.id,
    agentDefId: entity.agentDefId,
    ...(entity.name === undefined ? {} : { name: entity.name }),
    status: entity.status,
    created: entity.created,
    ...(entity.modified === undefined ? {} : { modified: entity.modified }),
    ...(entity.modelConfig == null ? {} : { modelConfig: entity.modelConfig }),
    ...(entity.avatarUrl === undefined ? {} : { avatarUrl: entity.avatarUrl }),
    ...(entity.agentFrameworkConfig === undefined ? {} : { agentFrameworkConfig: entity.agentFrameworkConfig }),
    closed: entity.closed,
    volatile: entity.volatile,
    preview: entity.preview,
  };
}

export async function updateAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  _agentMessageRepo: Repository<AgentInstanceMessageEntity>,
  agentId: string,
  data: AgentInstanceMetadataUpdate,
): Promise<AgentInstanceMetadata> {
  const instanceEntity = await agentInstanceRepo.findOne({ where: { id: agentId } });

  if (!instanceEntity) {
    throw new Error(`Agent instance not found: ${agentId}`);
  }

  const pickedProperties = pick(data, ['name', 'status', 'avatarUrl', 'modelConfig', 'closed', 'agentFrameworkConfig']);
  Object.assign(instanceEntity, pickedProperties);
  await agentInstanceRepo.save(instanceEntity);
  await bumpConversationListRevision(agentInstanceRepo.manager);

  return projectAgentInstanceMetadata(instanceEntity);
}

export async function deleteAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  _agentMessageRepo: Repository<AgentInstanceMessageEntity>,
  agentId: string,
): Promise<void> {
  // Conversation audit rows are append-only. "Delete" removes the instance
  // from normal directory views; Preferences' clear-data action deletes the
  // entire disposable MemeLoop database when irreversible erasure is wanted.
  await agentInstanceRepo.update(agentId, { closed: true, modified: new Date() });
  await bumpConversationListRevision(agentInstanceRepo.manager);
  logger.info(`Archived agent instance: ${agentId}`);
}

export interface DiscardVolatileAgentPreviewInput {
  agentId?: string;
  temporaryDefinitionId?: string;
}

/**
 * Irreversible cleanup is intentionally separate from deleteAgent(), whose
 * behavior is archival. Every deletion condition is re-checked in
 * the same transaction as the deletes so a stale renderer cannot erase a
 * durable conversation or definition.
 */
export async function discardVolatileAgentPreview(
  dataSource: DataSource,
  input: DiscardVolatileAgentPreviewInput,
): Promise<void> {
  const agentId = input.agentId?.trim();
  const temporaryDefinitionId = input.temporaryDefinitionId?.trim();
  if (!agentId && !temporaryDefinitionId) {
    throw new Error('discarding a volatile preview requires an agent or temporary definition id');
  }
  if (temporaryDefinitionId && !temporaryDefinitionId.startsWith('temp-')) {
    throw new Error(`Refusing to discard non-temporary agent definition: ${temporaryDefinitionId}`);
  }

  await withAgentTransaction(dataSource, async manager => {
    const instanceRepository = manager.getRepository(AgentInstanceEntity);
    const definitionRepository = manager.getRepository(AgentDefinitionEntity);
    const instance = agentId ? await instanceRepository.findOne({ where: { id: agentId } }) : null;
    const definition = temporaryDefinitionId
      ? await definitionRepository.findOne({ where: { id: temporaryDefinitionId } })
      : null;

    // A repeated cleanup after a committed transaction is harmless. Partial
    // absence is not: it can indicate a stale or confused-deputy request.
    if (!instance && !definition) return;
    if (agentId && !instance && !temporaryDefinitionId) return;
    if (instance && temporaryDefinitionId && !definition) {
      throw new Error(`Temporary agent definition not found: ${temporaryDefinitionId}`);
    }
    if (instance && (!instance.volatile || !instance.preview)) {
      throw new Error(`Refusing to discard non-preview or non-volatile agent instance: ${agentId}`);
    }
    if (instance && temporaryDefinitionId && instance.agentDefId !== temporaryDefinitionId) {
      throw new Error('Volatile preview does not belong to the supplied temporary definition');
    }

    if (temporaryDefinitionId) {
      const linkedInstances = await instanceRepository.find({ where: { agentDefId: temporaryDefinitionId } });
      const unexpectedInstance = linkedInstances.find(linked => !agentId || linked.id !== agentId || !linked.volatile || !linked.preview);
      if (unexpectedInstance) {
        throw new Error(`Refusing to discard referenced temporary agent definition: ${temporaryDefinitionId}`);
      }
      if (agentId && !instance && linkedInstances.length > 0) {
        throw new Error(`Volatile preview identity mismatch for temporary definition: ${temporaryDefinitionId}`);
      }
    }

    if (instance) {
      const conversationId = instance.id;

      // Scheduling and run state can keep live work associated with the
      // conversation. Their in-memory counterparts are released by the
      // service before entering this transaction.
      await manager.getRepository(ScheduledTaskEntity).delete({ agentInstanceId: conversationId });
      await manager.getRepository(AgentRunStateEntity).delete({ conversationId });

      // Derived projections first, canonical events and allocators next, then
      // the message/instance FK parents. Keep this list explicit when adding a
      // new conversation-scoped table: silent cascades would make omissions
      // invisible in review and tests.
      await manager.getRepository(ConversationTimelineRankCheckpointEntity).delete({ conversationId });
      await manager.getRepository(ConversationTimelineEntryEntity).delete({ conversationId });
      await manager.getRepository(ConversationTimelineStateEntity).delete({ conversationId });
      await manager.getRepository(ConversationTurnTombstoneEntity).delete({ conversationId });
      await manager.getRepository(AgentLoopCheckpointEntity).delete({ conversationId });
      await manager.getRepository(ConversationMetadataFieldEntity).delete({ conversationId });
      await manager.getRepository(ConversationMessageDetailEntity).delete({ conversationId });
      await manager.getRepository(ConversationAttachmentReferenceEntity).delete({ conversationId });
      await manager.getRepository(AgentInstanceMessageEntity).delete({ conversationId });
      await manager.getRepository(ConversationEventEntity).delete({ conversationId });
      await manager.getRepository(ConversationEventSequenceEntity).delete({ conversationId });
      await instanceRepository.delete(conversationId);
    }

    if (temporaryDefinitionId) {
      await manager.getRepository(ScheduledTaskEntity).delete({ agentDefinitionId: temporaryDefinitionId });
      await definitionRepository.delete(temporaryDefinitionId);
    }
    await bumpConversationListRevision(manager);
  });
}

export async function getAgents(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  page: number,
  pageSize: number,
  options?: { closed?: boolean; searchName?: string },
): Promise<AgentInstanceMetadata[]> {
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const whereCondition: Record<string, unknown> = {};
  whereCondition.volatile = false;

  if (options?.closed !== undefined) {
    whereCondition.closed = options.closed;
  }
  if (options?.searchName) {
    whereCondition.name = { like: `%${options.searchName}%` };
  }

  const [instances, _] = await agentInstanceRepo.findAndCount({
    where: Object.keys(whereCondition).length > 0 ? whereCondition : undefined,
    skip,
    take,
    order: { created: 'DESC' },
  });

  return instances.map(projectAgentInstanceMetadata);
}
