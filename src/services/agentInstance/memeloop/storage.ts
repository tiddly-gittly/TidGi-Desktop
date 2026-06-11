import type {
  AgentDefinition as MemeLoopAgentDefinition,
  AgentInstanceMeta,
  AttachmentReference,
  ChatMessage,
  ConversationMeta,
  GetMessagesOptions,
  IAgentStorage,
  ListConversationsOptions,
} from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinitionService';
import type { AgentInstance, AgentInstanceMessage, IAgentInstanceService } from '../interface';
import { toAgentInstanceMessage, toConversationMeta, toMemeLoopAgentDefinition, toMemeLoopMessage } from './messageMapping';

export class MemeLoopDesktopStorage implements IAgentStorage {
  public constructor(
    private readonly options: {
      agentInstanceService: IAgentInstanceService;
      agentDefinitionService: IAgentDefinitionService;
      notifyAgentChanged: (agentId: string, agent: AgentInstance) => void;
    },
  ) {}

  public async listConversations(options?: ListConversationsOptions): Promise<ConversationMeta[]> {
    const pageSize = options?.limit ?? 200;
    const page = options?.offset ? Math.floor(options.offset / pageSize) + 1 : 1;
    const agents = await this.options.agentInstanceService.getAgents(page, pageSize, { closed: false });
    return Promise.all(agents.map(async agent => {
      const fullAgent = await this.options.agentInstanceService.getAgent(agent.id);
      const definition = fullAgent ? await this.options.agentDefinitionService.getAgentDef(fullAgent.agentDefId) : undefined;
      return toConversationMeta({ ...agent, messages: fullAgent?.messages ?? [] }, definition);
    }));
  }

  public async getMessages(conversationId: string, _options?: GetMessagesOptions): Promise<ChatMessage[]> {
    const agent = await this.options.agentInstanceService.getAgent(conversationId);
    return agent?.messages.map(message => toMemeLoopMessage(message, conversationId)) ?? [];
  }

  public async appendMessage(message: ChatMessage): Promise<void> {
    const agentMessage = toAgentInstanceMessage(message);
    await this.saveMessageBestEffort(agentMessage);
    await this.upsertAndNotify(agentMessage);
  }

  public async upsertConversationMetadata(_meta: ConversationMeta): Promise<void> {
    return undefined;
  }

  public async insertMessagesIfAbsent(messages: ChatMessage[]): Promise<void> {
    const byAgent = new Map<string, AgentInstanceMessage[]>();
    for (const message of messages) {
      const agentMessage = toAgentInstanceMessage(message);
      const existing = byAgent.get(agentMessage.agentId) ?? [];
      existing.push(agentMessage);
      byAgent.set(agentMessage.agentId, existing);
    }

    for (const [agentId, agentMessages] of byAgent) {
      const agent = await this.options.agentInstanceService.getAgent(agentId);
      const existingIds = new Set(agent?.messages.map(message => message.id) ?? []);
      for (const agentMessage of agentMessages) {
        const shouldUpsert = !existingIds.has(agentMessage.id) || agentMessage.metadata?.isToolResult || agentMessage.metadata?.containsToolCall;
        if (shouldUpsert) {
          await this.saveMessageBestEffort(agentMessage);
          this.debounceMessageBestEffort(agentMessage, agentId);
        }
      }
      await this.notify(agentId);
    }
  }

  public async getAttachment(_contentHash: string): Promise<AttachmentReference | null> {
    return null;
  }

  public async saveAttachment(_reference: AttachmentReference, _data: Buffer | Uint8Array): Promise<void> {
    return undefined;
  }

  public async getAgentDefinition(id: string): Promise<MemeLoopAgentDefinition | null> {
    const definition = await this.options.agentDefinitionService.getAgentDef(id);
    return definition ? toMemeLoopAgentDefinition(definition) : null;
  }

  public async getMaxLamportClockForConversation(conversationId: string): Promise<number> {
    const messages = await this.getMessages(conversationId, { mode: 'metadata-only' });
    return messages.reduce((max, message) => Math.max(max, message.lamportClock), 0);
  }

  public async saveAgentInstance(_meta: AgentInstanceMeta): Promise<void> {
    return undefined;
  }

  public async getConversationMeta(conversationId: string): Promise<ConversationMeta | null> {
    const agent = await this.options.agentInstanceService.getAgent(conversationId);
    if (!agent) return null;
    const definition = await this.options.agentDefinitionService.getAgentDef(agent.agentDefId);
    return toConversationMeta(agent, definition);
  }

  private async notify(agentId: string): Promise<void> {
    const agent = await this.options.agentInstanceService.getAgent(agentId);
    if (agent) {
      this.options.notifyAgentChanged(agentId, agent);
    }
  }

  private async upsertAndNotify(message: AgentInstanceMessage): Promise<void> {
    this.debounceMessageBestEffort(message, message.agentId);
    const agent = await this.options.agentInstanceService.getAgent(message.agentId);
    if (!agent) return;

    const existingIndex = agent.messages.findIndex(item => item.id === message.id);
    if (existingIndex >= 0) {
      agent.messages[existingIndex] = message;
    } else {
      agent.messages.push(message);
    }
    this.options.notifyAgentChanged(message.agentId, agent);
  }

  private async saveMessageBestEffort(message: AgentInstanceMessage): Promise<void> {
    try {
      await this.options.agentInstanceService.saveUserMessage(message);
    } catch {
      const agent = await this.options.agentInstanceService.getAgent(message.agentId).catch(() => undefined);
      if (!agent) {
        throw new Error(`Agent instance not found: ${message.agentId}`);
      }
    }
  }

  private debounceMessageBestEffort(message: AgentInstanceMessage, agentId: string): void {
    try {
      this.options.agentInstanceService.debounceUpdateMessage(message, agentId, 0);
    } catch {
      // No database-backed debounce updater in framework-only unit tests.
    }
  }
}
