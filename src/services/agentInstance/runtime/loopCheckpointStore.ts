import {
  type LoopCheckpointRecord,
  type LoopCheckpointScope,
  type LoopCheckpointWriteOptions,
  type LoopScriptCheckpointStore,
  OrchestrationError,
  scopedLoopCheckpointKey,
} from 'memeloop';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

import { AgentLoopCheckpointEntity } from '@/services/database/schema/conversationEvent';
import { appendLocalConversationEventsInTransaction } from '../agentRepository';

/** Conversation-event-backed implementation of Core's script-checkpoint port. */
export class DesktopLoopCheckpointStore implements LoopScriptCheckpointStore {
  private readonly mutationLocks = new Map<string, Promise<void>>();

  public constructor(
    private readonly dataSource: DataSource,
    private readonly getLocalNodeId: () => Promise<string>,
  ) {}

  public async saveCheckpoint(
    conversationId: string,
    key: string,
    result: unknown,
    options: LoopCheckpointWriteOptions = {},
  ): Promise<void> {
    const namespacedKey = scopedLoopCheckpointKey(key, options.scope);
    await this.withMutationLock(`${conversationId}:${namespacedKey}`, async () => {
      const originNodeId = await this.getLocalNodeId();
      const checkpointResult = structuredClone(result);
      await this.dataSource.transaction(async manager => {
        const existing = await manager.getRepository(AgentLoopCheckpointEntity).findOne({
          where: { conversationId, key: namespacedKey },
        });
        const currentRevision = existing?.revision ?? 0;
        const currentFence = existing?.fencingEpoch ?? 0;
        const requestedFence = options.fencingEpoch ?? currentFence;
        if (requestedFence < currentFence) {
          throw new OrchestrationError({
            code: 'STALE_EPOCH',
            message: `loop checkpoint '${key}' is fenced by a newer writer`,
            retryable: false,
          });
        }
        if (options.expectedRevision !== undefined && options.expectedRevision !== currentRevision) {
          throw new OrchestrationError({
            code: 'CONFLICT',
            message: `loop checkpoint '${key}' revision ${currentRevision} does not match expected ${options.expectedRevision}`,
            retryable: true,
          });
        }
        await appendLocalConversationEventsInTransaction(manager, [{
          kind: 'loopCheckpoint',
          eventId: `loop-checkpoint:${randomUUID()}`,
          conversationId,
          originNodeId,
          timestamp: Date.now(),
          checkpoint: {
            key: namespacedKey,
            result: checkpointResult,
            revision: currentRevision + 1,
            fencingEpoch: requestedFence,
          },
        }]);
      });
    });
  }

  public async loadCheckpoint<T>(conversationId: string, key: string, options?: { scope?: LoopCheckpointScope }): Promise<T | undefined> {
    const record = await this.loadCheckpointRecord<T>(conversationId, key, options);
    return record?.result;
  }

  public async loadCheckpointRecord<T>(conversationId: string, key: string, options?: { scope?: LoopCheckpointScope }): Promise<LoopCheckpointRecord<T> | undefined> {
    const namespacedKey = scopedLoopCheckpointKey(key, options?.scope);
    const entity = await this.dataSource.getRepository(AgentLoopCheckpointEntity).findOneBy({ conversationId, key: namespacedKey });
    if (entity === null) return undefined;
    return {
      result: structuredClone(entity.result) as T,
      revision: entity.revision ?? 1,
      fencingEpoch: entity.fencingEpoch ?? 0,
      ...(options?.scope ? { scope: structuredClone(options.scope) } : {}),
    };
  }

  public async compareAndSetCheckpoint<T>(
    conversationId: string,
    key: string,
    expectedRevision: number | undefined,
    result: T,
    options: Omit<LoopCheckpointWriteOptions, 'expectedRevision'> = {},
  ): Promise<LoopCheckpointRecord<T>> {
    await this.saveCheckpoint(conversationId, key, result, { ...options, expectedRevision });
    const record = await this.loadCheckpointRecord<T>(conversationId, key, options);
    if (!record) {
      throw new OrchestrationError({
        code: 'UNKNOWN_EFFECT',
        message: `loop checkpoint '${key}' was saved but could not be reloaded`,
        retryable: true,
      });
    }
    return record;
  }

  private async withMutationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationLocks.get(key);
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    this.mutationLocks.set(key, current);
    if (previous) await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.mutationLocks.get(key) === current) this.mutationLocks.delete(key);
    }
  }
}
