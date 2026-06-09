import type { AgentDefinition as MemeLoopAgentDefinition, ChatMessage, ConversationMeta } from 'memeloop';

import type { AgentDefinition } from '@services/agentDefinition/interface';
import type { AgentInstance, AgentInstanceMessage } from '../interface';

const ORIGIN_NODE_ID = 'tidgi-desktop';

export type MemeLoopDesktopMessage = ChatMessage & {
  id: string;
  agentId: string;
  created?: Date;
  modified?: Date;
};

function toTimestamp(value: Date | string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? undefined : time;
}

function toDate(value: Date | string | number | undefined): Date | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toMemeLoopMessage(
  message: AgentInstanceMessage | (ChatMessage & Partial<AgentInstanceMessage>),
  fallbackAgentId?: string,
): MemeLoopDesktopMessage {
  const chatMessage = message as ChatMessage & Partial<AgentInstanceMessage>;
  const messageId = chatMessage.messageId ?? chatMessage.id ?? `${chatMessage.conversationId ?? fallbackAgentId ?? 'agent'}:${Date.now().toString(36)}`;
  const agentId = chatMessage.agentId ?? chatMessage.conversationId ?? fallbackAgentId ?? '';
  const created = toDate(chatMessage.created) ?? toDate(chatMessage.timestamp);
  const modified = toDate(chatMessage.modified) ?? created;
  const timestamp = chatMessage.timestamp ?? toTimestamp(modified) ?? toTimestamp(created) ?? Date.now();
  const metadata = chatMessage.metadata ? { ...chatMessage.metadata } : undefined;
  const metadataLamportClock = metadata?.lamportClock;

  return {
    ...chatMessage,
    messageId,
    conversationId: agentId,
    originNodeId: chatMessage.originNodeId ?? ORIGIN_NODE_ID,
    timestamp,
    lamportClock: typeof chatMessage.lamportClock === 'number'
      ? chatMessage.lamportClock
      : typeof metadataLamportClock === 'number'
      ? metadataLamportClock
      : timestamp,
    role: chatMessage.role,
    content: chatMessage.content,
    contentType: chatMessage.contentType ?? 'text/plain',
    duration: chatMessage.duration === null ? null : chatMessage.duration,
    metadata,
    id: messageId,
    agentId,
    created: created ?? new Date(timestamp),
    modified: modified ?? new Date(timestamp),
  };
}

export function toAgentInstanceMessage(
  message: ChatMessage | (ChatMessage & Partial<AgentInstanceMessage>),
  fallbackAgentId?: string,
): AgentInstanceMessage {
  const desktopMessage = message as ChatMessage & Partial<AgentInstanceMessage>;
  const messageId = desktopMessage.id ?? desktopMessage.messageId;
  const agentId = desktopMessage.agentId ?? desktopMessage.conversationId ?? fallbackAgentId ?? '';
  const timestamp = desktopMessage.timestamp ?? toTimestamp(desktopMessage.modified) ?? toTimestamp(desktopMessage.created) ?? Date.now();

  return {
    id: messageId,
    agentId,
    role: desktopMessage.role,
    content: desktopMessage.content,
    reasoning_content: desktopMessage.reasoning_content,
    contentType: desktopMessage.contentType ?? 'text/plain',
    created: toDate(desktopMessage.created) ?? new Date(timestamp),
    modified: toDate(desktopMessage.modified) ?? new Date(timestamp),
    metadata: desktopMessage.metadata ? { ...desktopMessage.metadata, lamportClock: desktopMessage.lamportClock } : { lamportClock: desktopMessage.lamportClock },
    hidden: desktopMessage.hidden,
    duration: desktopMessage.duration === null ? undefined : desktopMessage.duration,
  };
}

export function toMemeLoopAgentDefinition(definition: AgentDefinition): MemeLoopAgentDefinition {
  return {
    id: definition.id,
    name: definition.name ?? definition.id,
    description: definition.description ?? '',
    systemPrompt: '',
    tools: definition.agentTools?.map(tool => tool.toolId) ?? [],
    modelConfig: definition.aiApiConfig?.default
      ? {
        provider: definition.aiApiConfig.default.provider,
        model: definition.aiApiConfig.default.model,
        temperature: definition.aiApiConfig.modelParameters?.temperature,
        maxTokens: definition.aiApiConfig.modelParameters?.maxTokens,
      }
      : undefined,
    agentFrameworkConfig: definition.agentFrameworkConfig,
    version: '1',
  };
}

export function toConversationMeta(agent: AgentInstance, definition?: AgentDefinition): ConversationMeta {
  const messages = agent.messages ?? [];
  const lastMessage = messages[messages.length - 1];
  const lastMessageTimestamp = toTimestamp(lastMessage?.modified) ?? toTimestamp(lastMessage?.created) ?? Date.now();
  return {
    conversationId: agent.id,
    title: agent.name ?? definition?.name ?? agent.agentDefId,
    lastMessagePreview: lastMessage?.content ?? '',
    lastMessageTimestamp,
    messageCount: messages.length,
    originNodeId: ORIGIN_NODE_ID,
    definitionId: agent.agentDefId,
    instanceDelta: agent.agentFrameworkConfig ? { agentFrameworkConfig: agent.agentFrameworkConfig } : undefined,
    isUserInitiated: true,
  };
}
