import type {
  AgentDefinition,
  AgentInstanceMeta,
  AttachmentReference,
  ChatMessage,
  CompactionCandidatePage,
  ConversationEvent,
  ConversationEventDraft,
  ConversationEventPage,
  ConversationFullContentMessagePage,
  ConversationListPage,
  ConversationListPageCallOptions,
  ConversationMessageCursor,
  ConversationMessageDetailRange,
  ConversationMessageIdentity,
  ConversationMessagePage,
  ConversationMessageWindowResult,
  ConversationMeta,
  ConversationTimelinePage,
  ConversationTimelinePageCallOptions,
  GetCompactionCandidatePageOptions,
  GetConversationEventPageOptions,
  GetConversationListPageOptions,
  GetConversationMessageWindowAroundOptions,
  GetConversationTimelinePageOptions,
  GetFullContentMessagePageOptions,
  GetMessagePageOptions,
  GetMessagesOptions,
  GetRetainedCompactionControlsOptions,
  IAgentStorage,
  MessageVersionFrontier,
  MessageVersionFrontierCursor,
  MessageVersionFrontierPage,
  RetainedCompactionControlPage,
} from 'memeloop';
import { assertCanonicalChatMessageProjection, PORTABLE_LLM_REQUEST_LIMITS } from 'memeloop';

import type { IAgentDefinitionService } from '@services/agentDefinition/interface';
import type { IAgentInstanceService } from '../interface';

/**
 * TypeORM point reads are class instances. Core's canonical retry contract
 * deliberately rejects non-plain objects, so project the entity at the host
 * storage boundary instead of weakening or stringify-cloning the validator.
 */
function toPlainStorageMessage(message: ChatMessage): ChatMessage {
  const result: ChatMessage = {
    messageId: message.messageId,
    conversationId: message.conversationId,
    originNodeId: message.originNodeId,
    originSequence: message.originSequence,
    turnId: message.turnId,
    timestamp: message.timestamp,
    lamportClock: message.lamportClock,
    role: message.role,
    content: message.content,
    ...(message.parts == null ? {} : { parts: message.parts }),
    ...(message.toolCalls == null ? {} : { toolCalls: message.toolCalls }),
    ...(message.attachments == null ? {} : { attachments: message.attachments }),
    ...(message.detailRef == null ? {} : { detailRef: message.detailRef }),
    ...(message.reasoning_content == null ? {} : { reasoning_content: message.reasoning_content }),
    ...(message.contentType == null ? {} : { contentType: message.contentType }),
    ...(message.hidden == null ? {} : { hidden: message.hidden }),
    ...(message.duration == null ? {} : { duration: message.duration }),
    ...(message.metadata == null ? {} : { metadata: message.metadata }),
  };
  assertCanonicalChatMessageProjection(result, message.conversationId);
  return result;
}

export class MemeLoopDesktopStorage implements IAgentStorage {
  public constructor(
    private readonly options: {
      agentInstanceService: IAgentInstanceService;
      agentDefinitionService: IAgentDefinitionService;
      getLocalNodeId: () => Promise<string>;
    },
  ) {}

  public async listConversationsPage(
    options: GetConversationListPageOptions,
    callOptions?: ConversationListPageCallOptions,
  ): Promise<ConversationListPage> {
    callOptions?.signal?.throwIfAborted();
    const localNodeId = await this.options.getLocalNodeId();
    callOptions?.signal?.throwIfAborted();
    const page = await this.options.agentInstanceService.getAgentConversationListPage(localNodeId, options);
    callOptions?.signal?.throwIfAborted();
    return page;
  }

  public async getMessages(conversationId: string, options?: GetMessagesOptions): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];
    let after: ConversationMessageCursor | undefined;
    let expectedRevision: string | undefined;
    do {
      const page = await this.options.agentInstanceService.getAgentStorageMessagePage(conversationId, {
        limit: 80,
        maxBytes: 4 * 1024 * 1024,
        direction: 'forward',
        ...(options?.mode === undefined ? {} : { mode: options.mode }),
        ...(after ? { after, expectedRevision } : {}),
      });
      if (page.reset) throw new Error('conversation_message_page_invalidated');
      messages.push(...page.items);
      expectedRevision = page.revision;
      after = page.hasMoreAfter ? page.endCursor : undefined;
    } while (after);
    return messages;
  }

  public async getMessagePage(
    conversationId: string,
    options: GetMessagePageOptions,
    callOptions?: { signal?: AbortSignal },
  ): Promise<ConversationMessagePage> {
    callOptions?.signal?.throwIfAborted();
    const page = await this.options.agentInstanceService.getAgentStorageMessagePage(conversationId, options);
    callOptions?.signal?.throwIfAborted();
    return page;
  }

  public async getFullContentMessagePage(
    conversationId: string,
    options: GetFullContentMessagePageOptions,
    callOptions?: { signal?: AbortSignal },
  ): Promise<ConversationFullContentMessagePage> {
    callOptions?.signal?.throwIfAborted();
    const page = await this.options.agentInstanceService.getAgentStorageFullContentMessagePage(conversationId, options);
    callOptions?.signal?.throwIfAborted();
    return page;
  }

  public async getMessageIdentity(
    conversationId: string,
    messageId: string,
    callOptions?: { signal?: AbortSignal },
  ): Promise<ConversationMessageIdentity | null> {
    callOptions?.signal?.throwIfAborted();
    const identity = await this.options.agentInstanceService.getAgentMessageIdentity(conversationId, messageId);
    callOptions?.signal?.throwIfAborted();
    return identity;
  }

  public async getMessageById(
    conversationId: string,
    messageId: string,
    callOptions?: { signal?: AbortSignal },
  ): Promise<ChatMessage | null> {
    callOptions?.signal?.throwIfAborted();
    const message = await this.options.agentInstanceService.getAgentMessage(messageId);
    callOptions?.signal?.throwIfAborted();
    return message?.conversationId === conversationId ? toPlainStorageMessage(message) : null;
  }

  public async readMessageDetailRange(
    conversationId: string,
    messageId: string,
    offset: number,
    maxBytes: number,
    callOptions?: { signal?: AbortSignal },
  ): Promise<ConversationMessageDetailRange> {
    callOptions?.signal?.throwIfAborted();
    const range = await this.options.agentInstanceService.readAgentMessageDetailRange(
      conversationId,
      messageId,
      offset,
      maxBytes,
    );
    callOptions?.signal?.throwIfAborted();
    return range;
  }

  public async getMessageWindowAround(
    conversationId: string,
    options: GetConversationMessageWindowAroundOptions,
    callOptions?: { signal?: AbortSignal },
  ): Promise<ConversationMessageWindowResult> {
    callOptions?.signal?.throwIfAborted();
    const result = await this.options.agentInstanceService.getAgentStorageMessageWindowAround(conversationId, options);
    callOptions?.signal?.throwIfAborted();
    return result;
  }

  public getConversationTimelinePage(
    conversationId: string,
    options: GetConversationTimelinePageOptions,
    callOptions?: ConversationTimelinePageCallOptions,
  ): Promise<ConversationTimelinePage> {
    callOptions?.signal?.throwIfAborted();
    return this.options.agentInstanceService.getAgentConversationTimelinePage(conversationId, options)
      .then(page => {
        callOptions?.signal?.throwIfAborted();
        return page;
      });
  }

  public getCompactionCandidatePage(
    conversationId: string,
    options: GetCompactionCandidatePageOptions,
  ): Promise<CompactionCandidatePage> {
    return this.options.agentInstanceService.getAgentCompactionCandidatePage(conversationId, options);
  }

  public getRetainedCompactionControls(
    conversationId: string,
    options: GetRetainedCompactionControlsOptions,
  ): Promise<RetainedCompactionControlPage> {
    return this.options.agentInstanceService.getAgentRetainedCompactionControls(conversationId, options);
  }

  public async appendLocalEvent(draft: ConversationEventDraft): Promise<ConversationEvent> {
    return this.options.agentInstanceService.appendLocalConversationEvent(draft);
  }

  public async appendLocalEventsAtomic(drafts: readonly ConversationEventDraft[]): Promise<ConversationEvent[]> {
    return this.options.agentInstanceService.appendLocalConversationEventsAtomic(drafts);
  }

  public async upsertConversationMetadata(_meta: ConversationMeta): Promise<void> {
    return undefined;
  }

  public async insertEventsIfAbsent(events: readonly ConversationEvent[]): Promise<void> {
    await this.options.agentInstanceService.insertConversationEventsIfAbsent(events);
  }

  public getConversationEventPage(
    conversationId: string,
    options: GetConversationEventPageOptions,
  ): Promise<ConversationEventPage> {
    return this.options.agentInstanceService.getConversationEventPage(conversationId, options);
  }

  public getEventVersionFrontiers(conversationIds?: readonly string[]): Promise<MessageVersionFrontier[]> {
    return this.options.agentInstanceService.getConversationEventVersionFrontiers(conversationIds);
  }

  public getEventVersionFrontierPage(options: {
    limit: number;
    after?: MessageVersionFrontierCursor;
    conversationIds?: readonly string[];
  }): Promise<MessageVersionFrontierPage> {
    return this.options.agentInstanceService.getConversationEventVersionFrontierPage(options);
  }

  public getEventVersionFrontiersForKeys(
    keys: readonly MessageVersionFrontierCursor[],
  ): Promise<MessageVersionFrontier[]> {
    return this.options.agentInstanceService.getConversationEventVersionFrontiersForKeys(keys);
  }

  public getAttachment(contentHash: string, options?: { signal?: AbortSignal }): Promise<AttachmentReference | null> {
    return this.options.agentInstanceService.getAgentAttachmentReference(contentHash, options);
  }

  /**
   * Model requests are the one bounded consumer that needs complete attachment
   * bytes. Sync and UI callers continue to use range reads, while this adapter
   * assembles at most Core's per-file request limit without exposing the host
   * filesystem to the portable runtime.
   */
  public async readAttachmentData(contentHash: string, options?: { signal?: AbortSignal }): Promise<Uint8Array | null> {
    options?.signal?.throwIfAborted();
    const reference = await this.options.agentInstanceService.getAgentAttachmentReference(contentHash, options);
    options?.signal?.throwIfAborted();
    if (!reference) return null;
    if (
      reference.contentHash !== contentHash || !Number.isSafeInteger(reference.size) || reference.size < 1 ||
      reference.size > PORTABLE_LLM_REQUEST_LIMITS.fileBytes
    ) {
      throw new RangeError('model attachment exceeds the portable per-file limit');
    }
    const result = new Uint8Array(reference.size);
    const chunkBytes = 256 * 1_024;
    let offset = 0;
    while (offset < reference.size) {
      options?.signal?.throwIfAborted();
      const requestedBytes = Math.min(chunkBytes, reference.size - offset);
      const chunk = await this.options.agentInstanceService.readAgentAttachmentRange(
        contentHash,
        offset,
        requestedBytes,
        options,
      );
      options?.signal?.throwIfAborted();
      if (!chunk || chunk.byteLength < 1 || chunk.byteLength > requestedBytes) {
        throw new Error('model attachment range is incomplete');
      }
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  public saveAttachment(reference: AttachmentReference, data: Uint8Array): Promise<void> {
    return this.options.agentInstanceService.saveAgentAttachment(reference, data);
  }

  public readAttachmentRange(
    contentHash: string,
    offset: number,
    maxBytes: number,
    options?: { signal?: AbortSignal },
  ): Promise<Uint8Array | null> {
    return this.options.agentInstanceService.readAgentAttachmentRange(contentHash, offset, maxBytes, options);
  }

  public async conversationReferencesAttachment(
    conversationId: string,
    contentHash: string,
    options?: { signal?: AbortSignal },
  ): Promise<boolean> {
    options?.signal?.throwIfAborted();
    const referenced = await this.options.agentInstanceService.conversationReferencesAttachment(conversationId, contentHash);
    options?.signal?.throwIfAborted();
    return referenced;
  }

  public async getAgentDefinition(id: string): Promise<AgentDefinition | null> {
    const definition = await this.options.agentDefinitionService.getAgentDef(id);
    return definition ?? null;
  }

  public async getMaxLamportClockForConversation(conversationId: string): Promise<number> {
    return this.options.agentInstanceService.getMaxAgentLamportClock(conversationId);
  }

  public async saveAgentInstance(_meta: AgentInstanceMeta): Promise<void> {
    return undefined;
  }

  public async getConversationMeta(conversationId: string): Promise<ConversationMeta | null> {
    const localNodeId = await this.options.getLocalNodeId();
    return this.options.agentInstanceService.getAgentConversationMeta(localNodeId, conversationId);
  }
}
