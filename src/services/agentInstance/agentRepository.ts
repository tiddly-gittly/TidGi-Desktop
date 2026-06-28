/**
 * Agent CRUD Repository — Database operations for AgentInstance lifecycle.
 *
 * Pure functions that receive repositories as parameters.
 * Extracted from AgentInstanceService to reduce class size.
 */
import { backOff } from 'exponential-backoff';
import { pick } from 'lodash';
import { Repository } from 'typeorm';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import { AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { logger } from '@services/libs/log';

import type { AgentInstance, ChatMessage } from 'memeloop';
import { createAgentInstanceFromDefinition } from 'memeloop';
import { AGENT_INSTANCE_FIELDS, MESSAGE_FIELDS, toDatabaseCompatibleInstance, toDatabaseCompatibleMessage } from './utilities';

export async function createAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  agentDefinitionService: IAgentDefinitionService,
  agentDefinitionID?: string,
  options?: { preview?: boolean; volatile?: boolean },
): Promise<AgentInstance> {
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
  const instanceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const instanceData = createAgentInstanceFromDefinition(agentDefinition, {
    id: instanceId,
    volatile: options?.preview || options?.volatile || false,
  });

  const { created: _created, modified: _modified, ...instanceForPersistence } = instanceData;
  const instanceEntity = agentInstanceRepo.create(toDatabaseCompatibleInstance(instanceForPersistence));

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

  return { ...instanceData, created: now, modified: now };
}

export async function getAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  agentId: string,
): Promise<AgentInstance | undefined> {
  const instanceEntity = await agentInstanceRepo.findOne({
    where: { id: agentId },
    relations: { messages: true },
    order: { messages: { timestamp: 'ASC' } },
  });
  if (!instanceEntity) return undefined;

  const messages = (instanceEntity.messages || []).slice().sort((a, b) => {
    return a.timestamp - b.timestamp;
  });
  return {
    ...pick(instanceEntity, AGENT_INSTANCE_FIELDS),
    aiApiConfig: instanceEntity.aiApiConfig,
    systemPrompt: '',
    tools: [] as string[],
    description: '',
    version: '1',
    messages: messages,
  };
}

export async function updateAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  agentMessageRepo: Repository<AgentInstanceMessageEntity>,
  agentId: string,
  data: Partial<AgentInstance>,
): Promise<AgentInstance> {
  const instanceEntity = await agentInstanceRepo.findOne({
    where: { id: agentId },
    relations: { messages: true },
    order: { messages: { timestamp: 'ASC' } },
  });

  if (!instanceEntity) {
    throw new Error(`Agent instance not found: ${agentId}`);
  }

  const pickedProperties = pick(data, ['name', 'status', 'avatarUrl', 'aiApiConfig', 'closed', 'agentFrameworkConfig']);
  Object.assign(instanceEntity, pickedProperties);
  await agentInstanceRepo.save(instanceEntity);

  // Handle message updates if provided
  if (data.messages && data.messages.length > 0) {
    for (const message of data.messages) {
      const messageId = message.messageId;
      const existingMessage = instanceEntity.messages?.find(m => m.messageId === messageId);
      if (existingMessage) {
        existingMessage.content = message.content;
        existingMessage.timestamp = message.timestamp;
        existingMessage.lamportClock = message.lamportClock;
        if (message.parts) existingMessage.parts = message.parts;
        if (message.toolCalls) existingMessage.toolCalls = message.toolCalls;
        if (message.attachments) existingMessage.attachments = message.attachments;
        if (message.detailRef) existingMessage.detailRef = message.detailRef;
        if (message.reasoning_content) existingMessage.reasoning_content = message.reasoning_content;
        if (message.metadata) existingMessage.metadata = message.metadata;
        if (message.contentType) existingMessage.contentType = message.contentType;
        if (message.hidden !== undefined) existingMessage.hidden = message.hidden;
        if (message.duration !== undefined) existingMessage.duration = message.duration ?? undefined;
        await agentMessageRepo.save(existingMessage);
      } else {
        const messageData = pick(message, MESSAGE_FIELDS) as ChatMessage;
        const messageEntity = agentMessageRepo.create(toDatabaseCompatibleMessage(messageData));
        await agentMessageRepo.save(messageEntity);
        if (!instanceEntity.messages) instanceEntity.messages = [];
        instanceEntity.messages.push(messageEntity);
      }
    }
  }

  return {
    ...pick(instanceEntity, AGENT_INSTANCE_FIELDS),
    aiApiConfig: instanceEntity.aiApiConfig,
    systemPrompt: '',
    tools: [] as string[],
    description: '',
    version: '1',
    messages: instanceEntity.messages || [],
  };
}

export async function deleteAgent(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  agentMessageRepo: Repository<AgentInstanceMessageEntity>,
  agentId: string,
): Promise<void> {
  await agentMessageRepo.delete({ conversationId: agentId });
  await agentInstanceRepo.delete(agentId);
  logger.info(`Deleted agent instance: ${agentId}`);
}

export async function getAgents(
  agentInstanceRepo: Repository<AgentInstanceEntity>,
  page: number,
  pageSize: number,
  options?: { closed?: boolean; searchName?: string },
): Promise<Omit<AgentInstance, 'messages'>[]> {
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

  return instances.map(entity => pick(entity, AGENT_INSTANCE_FIELDS)) as unknown as Array<Omit<AgentInstance, 'messages'>>;
}
