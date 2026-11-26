/** @vitest-environment node */
import 'reflect-metadata';

import { AgentGoalEntity } from '@/services/database/schema/agentGoal';
import type { AgentGoal } from 'memeloop';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesktopGoalStore } from '../goalStore';

const makeGoal = (conversationId = 'conversation', revision = 1): AgentGoal => ({
  id: 'goal',
  conversationId,
  definitionId: 'assistant',
  executionNodeId: 'desktop',
  objective: 'Prepare a plan from the knowledge base',
  status: 'active',
  revision,
  round: 1,
  pendingRound: { requestId: 'request-1', turnId: 'turn-1', message: 'Continue', runId: 'run-1' },
  updatedAt: '2026-11-04T00:00:00.000Z',
});

describe('DesktopGoalStore', () => {
  let database: DataSource;
  let store: DesktopGoalStore;
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'tidgi-goals-'));
    database = new DataSource({
      type: 'better-sqlite3',
      database: path.join(directory, 'goals.sqlite'),
      entities: [AgentGoalEntity],
      synchronize: true,
    });
    await database.initialize();
    store = new DesktopGoalStore(database);
  });
  afterEach(async () => {
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('restores full pending round state and isolates caller mutations', async () => {
    const goal = makeGoal();
    expect(await store.save(goal, null)).toBe(true);
    goal.pendingRound!.message = 'Changed by caller';
    await database.destroy();
    await database.initialize();
    store = new DesktopGoalStore(database);
    expect(await store.get(goal.conversationId)).toEqual(makeGoal());
    expect(await store.get('missing')).toBeNull();
  });

  it('atomically keeps a user pause when an old round writes its completion', async () => {
    const goal = makeGoal();
    expect(await store.save(goal, null)).toBe(true);
    expect(await store.save(goal, null)).toBe(false);
    const writes = await Promise.all([
      store.save({ ...goal, revision: 2, status: 'paused' }, 1),
      store.save({ ...goal, revision: 2, status: 'completed', evidence: 'old round' }, 1),
    ]);
    expect(writes).toEqual([true, false]);
    expect(await store.get(goal.conversationId)).toMatchObject({ status: 'paused', revision: 2 });
  });

  it('restores only this node active goals in bounded, stable pages', async () => {
    for (let index = 0; index < 105; index++) {
      await store.save(makeGoal(`conversation-${String(index).padStart(3, '0')}`), null);
    }
    await store.save({ ...makeGoal('paused'), status: 'paused' }, null);
    await store.save({ ...makeGoal('remote'), executionNodeId: 'other-device' }, null);
    const first = await store.listActive('desktop');
    expect(first.items).toHaveLength(100);
    const second = await store.listActive('desktop', first.nextCursor);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.items, ...second.items].map(goal => goal.conversationId)).size).toBe(105);
  });
});
