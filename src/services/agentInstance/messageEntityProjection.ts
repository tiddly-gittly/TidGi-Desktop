import type { ChatMessage } from 'memeloop';

export const CANONICAL_MESSAGE_FIELDS = [
  'messageId',
  'conversationId',
  'originNodeId',
  'originSequence',
  'turnId',
  'timestamp',
  'lamportClock',
  'role',
  'content',
  'parts',
  'toolCalls',
  'attachments',
  'detailRef',
  'reasoning_content',
  'contentType',
  'hidden',
  'metadata',
  'duration',
] as const;

/** Add only the SQLite projection discriminator to one canonical message. */
export function projectChatMessageEntity(message: ChatMessage): ChatMessage & {
  isContextCompaction: boolean;
  originSequence: number;
  turnId: string;
} {
  if (!Number.isSafeInteger(message.originSequence) || message.originSequence <= 0) {
    throw new Error('conversation_event_origin_sequence_required');
  }
  if (!message.turnId) throw new Error('conversation_event_turn_id_required');
  return {
    ...message,
    originSequence: message.originSequence,
    turnId: message.turnId,
    isContextCompaction: message.metadata?.contextCompaction !== undefined,
  };
}
