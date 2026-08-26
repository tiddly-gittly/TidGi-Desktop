/** @vitest-environment node */
import { createChatMessage } from 'memeloop';
import type { AgentConversationUpdate, AgentInstance, ChatMessage } from 'memeloop';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AgentInstanceService } from '../index';

describe('AgentInstanceService renderer subscription bounds', () => {
  it('emits metadata with zero messages rather than a 100k-message snapshot', () => {
    const service = new AgentInstanceService();
    const subject = new BehaviorSubject<AgentInstance | undefined>(undefined);
    Object.assign(service as unknown as Record<string, unknown>, {
      agentInstanceSubjects: new Map([['conversation', subject]]),
    });
    const messages: ChatMessage[] = Array.from({ length: 100_000 }, (_, index) =>
      createChatMessage({
        messageId: `message-${index}`,
        turnId: `message-${Math.floor(index / 2) * 2}`,
        conversationId: 'conversation',
        originNodeId: 'desktop',
        originSequence: index + 1,
        timestamp: index,
        lamportClock: index + 1,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `message ${index}`,
      }));
    const agent: AgentInstance = {
      id: 'conversation',
      agentDefId: 'definition',
      version: '1',
      description: '',
      systemPrompt: '',
      tools: [],
      created: new Date(),
      status: { state: 'working', modified: new Date() },
      messages,
    };
    let received: AgentInstance | undefined;
    const subscription = subject.subscribe(update => {
      if (update) received = update;
    });

    (service as unknown as {
      notifyAgentUpdate(agentId: string, value: AgentInstance): void;
    }).notifyAgentUpdate('conversation', agent);

    expect(received?.messages).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(received))).toBeLessThan(2_000);
    subscription.unsubscribe();
  });

  it('publishes the exact appended batch count and omits it for non-append invalidations', async () => {
    const service = new AgentInstanceService();
    const subject = new Subject<AgentConversationUpdate>();
    const updates: AgentConversationUpdate[] = [];
    const subscription = subject.subscribe(update => updates.push(update));
    const getConversationState = vi.fn()
      .mockResolvedValueOnce({ revision: '10', totalMessages: 103 })
      .mockResolvedValueOnce({ revision: '11', totalMessages: 102 });
    Object.assign(service as unknown as Record<string, unknown>, {
      conversationSubjects: new Map([['conversation', subject]]),
      getConversationState,
    });
    const publish = service as unknown as {
      publishConversationInvalidation(
        conversationId: string,
        previousState: { revision: string; totalMessages: number },
        reason: 'append' | 'compaction' | 'tombstone' | 'reset',
      ): Promise<void>;
    };

    await publish.publishConversationInvalidation(
      'conversation',
      { revision: '7', totalMessages: 100 },
      'append',
    );
    await publish.publishConversationInvalidation(
      'conversation',
      { revision: '8', totalMessages: 103 },
      'reset',
    );

    expect(updates).toEqual([
      {
        kind: 'invalidated',
        conversationId: 'conversation',
        previousRevision: '7',
        revision: '10',
        reason: 'append',
        appendedMessageCount: 3,
      },
      {
        kind: 'invalidated',
        conversationId: 'conversation',
        previousRevision: '10',
        revision: '11',
        reason: 'reset',
      },
    ]);
    expect(updates[1]).not.toHaveProperty('appendedMessageCount');
    subscription.unsubscribe();
  });

  it('uses a serialized watermark when concurrent append callbacks arrive in reverse commit order', async () => {
    const service = new AgentInstanceService();
    const subject = new Subject<AgentConversationUpdate>();
    const updates: AgentConversationUpdate[] = [];
    const subscription = subject.subscribe(update => updates.push(update));
    const getConversationState = vi.fn()
      .mockResolvedValue({ revision: '105', totalMessages: 105 });
    Object.assign(service as unknown as Record<string, unknown>, {
      conversationSubjects: new Map([['conversation', subject]]),
      getConversationState,
    });
    const publish = service as unknown as {
      publishConversationInvalidation(
        conversationId: string,
        previousState: { revision: string; totalMessages: number },
        reason: 'append',
      ): Promise<void>;
    };

    // The operation that observed revision 105 finishes first; the delayed
    // callback from the operation that only produced revision 103 arrives
    // afterwards with the same pre-commit baseline.
    await publish.publishConversationInvalidation(
      'conversation',
      { revision: '100', totalMessages: 100 },
      'append',
    );
    await publish.publishConversationInvalidation(
      'conversation',
      { revision: '100', totalMessages: 100 },
      'append',
    );

    expect(updates).toEqual([
      expect.objectContaining({
        previousRevision: '100',
        revision: '105',
        appendedMessageCount: 5,
      }),
    ]);
    expect(updates.reduce(
      (count, update) => count + (update.kind === 'invalidated' && update.reason === 'append' ? update.appendedMessageCount : 0),
      0,
    )).toBe(5);
    subscription.unsubscribe();
  });

  it('advances the serialized revision chain after a durable projection', async () => {
    const service = new AgentInstanceService();
    const subject = new Subject<AgentConversationUpdate>();
    const updates: AgentConversationUpdate[] = [];
    const subscription = subject.subscribe(update => updates.push(update));
    const getConversationState = vi.fn()
      .mockResolvedValueOnce({ revision: '2', totalMessages: 2 })
      .mockResolvedValueOnce({ revision: '3', totalMessages: 3 });
    Object.assign(service as unknown as Record<string, unknown>, {
      conversationSubjects: new Map([['conversation', subject]]),
      getConversationState,
      // This test isolates publication ordering from the independently tested
      // Core list projector (the installed package may lag a source checkout).
      toConversationProjection: (message: ChatMessage) => message,
    });
    const publication = service as unknown as {
      publishConversationMessage(
        message: ChatMessage,
        streaming: boolean,
        previousState: { revision: string; totalMessages: number },
      ): Promise<void>;
      publishConversationInvalidation(
        conversationId: string,
        previousState: { revision: string; totalMessages: number },
        reason: 'append',
      ): Promise<void>;
    };

    await publication.publishConversationMessage(
      createChatMessage({
        messageId: 'message-2',
        turnId: 'turn-2',
        conversationId: 'conversation',
        originNodeId: 'desktop',
        originSequence: 2,
        timestamp: 2,
        lamportClock: 2,
        role: 'assistant',
        content: 'durable projection',
      }),
      false,
      { revision: '1', totalMessages: 1 },
    );
    await publication.publishConversationInvalidation(
      'conversation',
      { revision: '2', totalMessages: 2 },
      'append',
    );

    expect(updates).toEqual([
      expect.objectContaining({
        kind: 'projection',
        revision: '2',
        streaming: false,
      }),
      expect.objectContaining({
        kind: 'invalidated',
        previousRevision: '2',
        revision: '3',
        reason: 'append',
        appendedMessageCount: 1,
      }),
    ]);
    subscription.unsubscribe();
  });

  it('suppresses same-revision duplicates and resets on revision/count gaps or backward state', async () => {
    const service = new AgentInstanceService();
    const subject = new Subject<AgentConversationUpdate>();
    const updates: AgentConversationUpdate[] = [];
    const subscription = subject.subscribe(update => updates.push(update));
    const getConversationState = vi.fn()
      .mockResolvedValueOnce({ revision: '3', totalMessages: 2 })
      .mockResolvedValueOnce({ revision: '3', totalMessages: 2 })
      .mockResolvedValueOnce({ revision: '2', totalMessages: 1 });
    Object.assign(service as unknown as Record<string, unknown>, {
      conversationSubjects: new Map([['conversation', subject]]),
      getConversationState,
    });
    const publish = service as unknown as {
      publishConversationInvalidation(
        conversationId: string,
        previousState: { revision: string; totalMessages: number },
        reason: 'append',
      ): Promise<void>;
    };
    const previousState = { revision: '1', totalMessages: 1 };

    await publish.publishConversationInvalidation('conversation', previousState, 'append');
    await publish.publishConversationInvalidation('conversation', previousState, 'append');
    await publish.publishConversationInvalidation('conversation', previousState, 'append');

    expect(updates).toEqual([
      expect.objectContaining({
        previousRevision: '1',
        revision: '3',
        reason: 'reset',
      }),
      expect.objectContaining({
        previousRevision: '3',
        revision: '2',
        reason: 'reset',
      }),
    ]);
    expect(updates.every(update => !('appendedMessageCount' in update))).toBe(true);
    subscription.unsubscribe();
  });
});
