import type { ConversationEvent } from 'memeloop';

/** Build durable E2E history with independent origins and incomparable compaction summaries. */
export function createLongConversationEvents(input: { conversationId: string; turnCount: number }): { events: ConversationEvent[]; compactionCount: number } {
  const baseTimestamp = 1_700_000_000_000;
  const messageOrigins = Array.from(
    { length: 3 },
    (_, index) => `e2e-long-messages-${index + 1}:${input.conversationId}`,
  );
  const messageOriginSequences = [0, 0, 0];
  const messageOriginTurnCounts = [0, 0, 0];
  const compactionOrigin = `e2e-long-compactions:${input.conversationId}`;
  const summaryTurnIndexes = [
    ...new Set([
      Math.min(input.turnCount - 1, Math.max(0, Math.ceil(input.turnCount / 3) - 1)),
      Math.min(input.turnCount - 1, Math.max(0, Math.ceil(input.turnCount * 2 / 3) - 1)),
      // Leave exactly the default 32-turn recent tail uncovered. This
      // proves the model-request path combines retained semantic summaries
      // with recent history without making an unrelated provider call.
      Math.max(0, input.turnCount - 33),
    ]),
  ];
  const summaryAt = new Map(summaryTurnIndexes.map((turnIndex, index) => [turnIndex, index]));
  const events: ConversationEvent[] = [];

  for (let turnIndex = 0; turnIndex < input.turnCount; turnIndex++) {
    const originIndex = Math.min(2, Math.floor(turnIndex * 3 / input.turnCount));
    const messageOrigin = messageOrigins[originIndex];
    const number = turnIndex.toString().padStart(5, '0');
    const turnId = `e2e-long-user:${input.conversationId}:${number}`;
    const userSequence = messageOriginSequences[originIndex] + 1;
    const assistantSequence = userSequence + 1;
    messageOriginSequences[originIndex] = assistantSequence;
    messageOriginTurnCounts[originIndex] += 1;
    const timestamp = baseTimestamp + turnIndex * 4;
    events.push(
      {
        kind: 'message',
        eventId: `e2e-long-user:${input.conversationId}:${number}`,
        conversationId: input.conversationId,
        originNodeId: messageOrigin,
        originSequence: userSequence,
        lamportClock: turnIndex * 4 + 1,
        timestamp,
        message: {
          messageId: `e2e-long-user:${input.conversationId}:${number}`,
          turnId,
          role: 'user',
          content: `E2E long question ${number}`,
          parts: [{ type: 'text', text: `E2E long question ${number}` }],
        },
      },
      {
        kind: 'message',
        eventId: `e2e-long-assistant:${input.conversationId}:${number}`,
        conversationId: input.conversationId,
        originNodeId: messageOrigin,
        originSequence: assistantSequence,
        lamportClock: turnIndex * 4 + 2,
        timestamp: timestamp + 1,
        message: {
          messageId: `e2e-long-assistant:${input.conversationId}:${number}`,
          turnId,
          role: 'assistant',
          content: `E2E long answer ${number}`,
          parts: [{ type: 'text', text: `E2E long answer ${number}` }],
        },
      },
    );

    const summaryIndex = summaryAt.get(turnIndex);
    if (summaryIndex !== undefined) {
      // Keep the three summaries causally incomparable (one origin each),
      // exactly like concurrent compaction on independent devices. Core
      // must retain and merge all three until a later semantic summary
      // explicitly dominates them.
      const coveredVersion = { [messageOrigin]: messageOriginSequences[originIndex] };
      const coveredMessageCountByOrigin = { ...coveredVersion };
      const coveredUserTurnCountByOrigin = { [messageOrigin]: messageOriginTurnCounts[originIndex] };
      const droppedMessageCount = coveredMessageCountByOrigin[messageOrigin];
      const droppedTurnCount = coveredUserTurnCountByOrigin[messageOrigin];
      events.push({
        kind: 'compaction',
        mode: 'summary',
        eventId: `e2e-long-compaction-event:${input.conversationId}:${summaryIndex + 1}`,
        conversationId: input.conversationId,
        originNodeId: compactionOrigin,
        originSequence: summaryIndex + 1,
        lamportClock: turnIndex * 4 + 3,
        timestamp: timestamp + 2,
        boundary: {
          version: 2,
          coveredVersion,
          coveredMessageCountByOrigin,
          coveredUserTurnCountByOrigin,
          droppedMessageCount,
          droppedTurnCount,
        },
        summary: {
          turnId: `e2e-long-compaction-turn:${input.conversationId}:${summaryIndex + 1}`,
          content: `E2E durable compaction summary ${summaryIndex + 1}`,
        },
      });
    }
  }

  return { events, compactionCount: summaryTurnIndexes.length };
}
