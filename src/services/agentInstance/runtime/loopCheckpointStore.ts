import {
  type ControlLeaseIdentity,
  type LoopCheckpointRecord,
  type LoopCheckpointScope,
  type LoopCheckpointWriteOptions,
  type LoopScriptCheckpointStore,
  OrchestrationError,
  scopedLoopCheckpointKey,
} from 'memeloop';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

import { AgentLoopCheckpointEntity, AgentLoopCheckpointExecutionLeaseEntity } from '@/services/database/schema/conversationEvent';
import { appendLocalConversationEventsInTransaction } from '../agentRepository';
import { withDesktopAgentRuntimeTransaction } from './agentRunStateStore';

/** Conversation-event-backed implementation of Core's script-checkpoint port. */
export class DesktopLoopCheckpointStore implements LoopScriptCheckpointStore {
  private readonly mutationLocks = new Map<string, Promise<void>>();

  public readonly checkpointFenceStore = {
    acquireCheckpointFence: async (
      runId: string,
      holder: string,
      ttlMs: number,
    ): Promise<ControlLeaseIdentity> => this.acquireCheckpointFence(runId, holder, ttlMs),
    renewCheckpointFence: async (
      fence: ControlLeaseIdentity,
      ttlMs: number,
    ): Promise<ControlLeaseIdentity> => this.renewCheckpointFence(fence, ttlMs),
    releaseCheckpointFence: async (fence: ControlLeaseIdentity): Promise<void> => this.releaseCheckpointFence(fence),
  };

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
      await withDesktopAgentRuntimeTransaction(this.dataSource, async manager => {
        if (options.scope?.runId !== undefined && options.leasePrecondition === undefined) {
          throw staleFenceError(key, 'run-scoped checkpoint writes require an execution lease');
        }
        if (options.leasePrecondition !== undefined) {
          const lease = await manager.getRepository(AgentLoopCheckpointExecutionLeaseEntity).findOneBy({
            name: options.leasePrecondition.name,
          });
          if (!isExactCurrentCheckpointFence(lease, options.leasePrecondition, Date.now())) {
            throw staleFenceError(key, 'checkpoint execution lease is no longer current');
          }
          if (
            options.scope?.runId !== undefined &&
            options.leasePrecondition.name !== checkpointExecutionLeaseName(options.scope.runId)
          ) {
            throw staleFenceError(key, 'checkpoint execution lease does not own this run');
          }
        }
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

  private async acquireCheckpointFence(
    runId: string,
    holder: string,
    ttlMs: number,
  ): Promise<ControlLeaseIdentity> {
    assertLeaseIdentifier(runId, 'runId');
    assertLeaseIdentifier(holder, 'holder');
    assertLeaseDuration(ttlMs);
    const name = checkpointExecutionLeaseName(runId);
    return withDesktopAgentRuntimeTransaction(this.dataSource, async manager => {
      const repository = manager.getRepository(AgentLoopCheckpointExecutionLeaseEntity);
      const existing = await repository.findOneBy({ name });
      const now = Date.now();
      if (existing && existing.expiresAt > now) {
        throw new OrchestrationError({
          code: 'CONFLICT',
          message: `checkpoint execution lease '${name}' is already held`,
          retryable: true,
          retryAfterMs: existing.expiresAt - now,
        });
      }
      const previousEpoch = parseCheckpointEpoch(existing?.epoch);
      if (previousEpoch >= Number.MAX_SAFE_INTEGER) throw new Error('checkpoint lease epoch exhausted');
      const epoch = String(previousEpoch + 1);
      const lease: ControlLeaseIdentity = {
        name,
        holder,
        leaseId: randomUUID(),
        epoch,
      };
      await repository.save(Object.assign(new AgentLoopCheckpointExecutionLeaseEntity(), {
        ...lease,
        expiresAt: now + ttlMs,
      }));
      return lease;
    });
  }

  private async renewCheckpointFence(
    fence: ControlLeaseIdentity,
    ttlMs: number,
  ): Promise<ControlLeaseIdentity> {
    assertCheckpointFence(fence);
    assertLeaseDuration(ttlMs);
    return withDesktopAgentRuntimeTransaction(this.dataSource, async manager => {
      const repository = manager.getRepository(AgentLoopCheckpointExecutionLeaseEntity);
      const existing = await repository.findOneBy({ name: fence.name });
      const now = Date.now();
      if (!isExactCurrentCheckpointFence(existing, fence, now)) {
        throw staleFenceError(fence.name, 'checkpoint execution lease cannot be renewed');
      }
      const result = await repository.update(
        {
          name: fence.name,
          holder: fence.holder,
          leaseId: fence.leaseId,
          epoch: fence.epoch,
          expiresAt: existing.expiresAt,
        },
        { expiresAt: now + ttlMs },
      );
      if (result.affected !== 1) {
        throw staleFenceError(fence.name, 'checkpoint execution lease changed during renewal');
      }
      return { ...fence };
    });
  }

  private async releaseCheckpointFence(fence: ControlLeaseIdentity): Promise<void> {
    assertCheckpointFence(fence);
    await withDesktopAgentRuntimeTransaction(this.dataSource, async manager => {
      await manager.getRepository(AgentLoopCheckpointExecutionLeaseEntity).update(
        {
          name: fence.name,
          holder: fence.holder,
          leaseId: fence.leaseId,
          epoch: fence.epoch,
        },
        { expiresAt: 0 },
      );
    });
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

function checkpointExecutionLeaseName(runId: string): string {
  return `loop-checkpoint-run/${runId}`;
}

function staleFenceError(key: string, message: string): OrchestrationError {
  return new OrchestrationError({
    code: 'STALE_EPOCH',
    message: `loop checkpoint '${key}' rejected: ${message}`,
    retryable: false,
  });
}

function assertLeaseIdentifier(value: string, field: string): void {
  if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value, 'utf8') > 512) {
    throw new TypeError(`invalid checkpoint lease ${field}`);
  }
}

function assertLeaseDuration(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || Date.now() + ttlMs > Number.MAX_SAFE_INTEGER) {
    throw new TypeError('invalid checkpoint lease duration');
  }
}

function assertCheckpointFence(fence: ControlLeaseIdentity): void {
  assertLeaseIdentifier(fence.name, 'name');
  assertLeaseIdentifier(fence.holder, 'holder');
  assertLeaseIdentifier(fence.leaseId, 'leaseId');
  if (!/^[1-9]\d*$/u.test(fence.epoch)) throw new TypeError('invalid checkpoint lease epoch');
}

function parseCheckpointEpoch(value: string | undefined): number {
  if (value === undefined) return 0;
  if (!/^[1-9]\d*$/u.test(value)) throw new Error('checkpoint lease epoch is corrupt');
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch)) throw new Error('checkpoint lease epoch exhausted');
  return epoch;
}

function isExactCurrentCheckpointFence(
  persisted: AgentLoopCheckpointExecutionLeaseEntity | null,
  expected: ControlLeaseIdentity,
  now: number,
): persisted is AgentLoopCheckpointExecutionLeaseEntity {
  return persisted !== null &&
    persisted.holder === expected.holder &&
    persisted.leaseId === expected.leaseId &&
    persisted.epoch === expected.epoch &&
    persisted.expiresAt > now;
}
