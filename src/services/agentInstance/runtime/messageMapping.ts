import type { AgentDefinition, ConversationMeta } from 'memeloop';

import type { AgentInstance } from 'memeloop';

export function toConversationMeta(agent: AgentInstance, _definition?: AgentDefinition): ConversationMeta {
  const messages = agent.messages ?? [];
  const last = messages[messages.length - 1];
  const ts = last?.timestamp ?? Date.now();
  return {
    conversationId: agent.id,
    title: agent.name ?? agent.agentDefId,
    lastMessagePreview: last?.content ?? '',
    lastMessageTimestamp: ts,
    messageCount: messages.length,
    originNodeId: 'tidgi-desktop',
    definitionId: agent.agentDefId,
    instanceDelta: agent.agentFrameworkConfig ? { agentFrameworkConfig: agent.agentFrameworkConfig } : undefined,
    isUserInitiated: true,
  };
}
