import type { LoopScriptCheckpointStore } from 'memeloop';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

import { AgentLoopCheckpointEntity } from '@/services/database/schema/conversationEvent';
import { appendLocalConversationEventsInTransaction } from '../agentRepository';

/** Conversation-event-backed implementation of Core's script-checkpoint port. */
export class DesktopLoopCheckpointStore implements LoopScriptCheckpointStore {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly getLocalNodeId: () => Promise<string>,
  ) {}

  public async saveCheckpoint(conversationId: string, key: string, result: unknown): Promise<void> {
    const originNodeId = await this.getLocalNodeId();
    const checkpointResult = structuredClone(result);
    await this.dataSource.transaction(async manager => {
      await appendLocalConversationEventsInTransaction(manager, [{
        kind: 'loopCheckpoint',
        eventId: `loop-checkpoint:${randomUUID()}`,
        conversationId,
        originNodeId,
        timestamp: Date.now(),
        checkpoint: { key, result: checkpointResult },
      }]);
    });
  }

  public async loadCheckpoint<T>(conversationId: string, key: string): Promise<T | undefined> {
    const entity = await this.dataSource.getRepository(AgentLoopCheckpointEntity).findOneBy({ conversationId, key });
    return entity === null ? undefined : structuredClone(entity.result) as T;
  }
}
