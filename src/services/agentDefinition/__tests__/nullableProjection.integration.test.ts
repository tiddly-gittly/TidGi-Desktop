/** @vitest-environment node */
import 'reflect-metadata';

import type { AgentDefinition } from 'memeloop';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentInstanceService } from '@services/agentInstance';
import { resolveDesktopAgentDefinition } from '@services/agentInstance/runtime/runtime';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { AgentDefinitionService } from '../index';

const optionalFields = ['avatarUrl', 'agentFrameworkID', 'agentFrameworkConfig', 'agentTools', 'heartbeat'] as const;
const baseDefinition: AgentDefinition = {
  id: 'sqlite-definition',
  name: 'SQLite definition',
  description: 'Persistence regression fixture',
  systemPrompt: '',
  tools: [],
  version: '1',
};

let directory: string;
let database: DataSource;
let definitions: AgentDefinitionService;

async function openDatabase(): Promise<void> {
  database = new DataSource({
    type: 'better-sqlite3',
    database: path.join(directory, 'definitions.sqlite'),
    entities: [AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity],
    synchronize: true,
  });
  await database.initialize();
  definitions = new AgentDefinitionService();
  Object.assign(definitions, { dataSource: database, agentDefRepository: database.getRepository(AgentDefinitionEntity) });
}

async function reopenDatabase(): Promise<void> {
  await database.destroy();
  await openDatabase();
}

function expectOmittedOptionalFields(value: AgentDefinition | undefined, except?: typeof optionalFields[number]): void {
  expect(value).toBeDefined();
  for (const field of optionalFields) {
    if (field !== except) expect(value).not.toHaveProperty(field);
  }
}

async function resolveDefinition(): Promise<AgentDefinition | null> {
  const instances = new AgentInstanceService();
  vi.spyOn(instances, 'getAgentMetadata').mockResolvedValue(undefined);
  return await resolveDesktopAgentDefinition({
    agentId: 'sqlite-conversation',
    definitionId: baseDefinition.id,
    agentDefinitionService: definitions,
    agentInstanceService: instances,
  });
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'tidgi-agent-definition-'));
  await openDatabase();
});

afterEach(async () => {
  if (database.isInitialized) await database.destroy();
  await rm(directory, { recursive: true, force: true });
});

describe('SQLite nullable AgentDefinition projection', () => {
  it('projects omitted fields after disk reload and resolves the definition for execution', async () => {
    const created = await definitions.createAgentDef({ ...baseDefinition });
    await reopenDatabase();

    const stored = await database.getRepository(AgentDefinitionEntity).findOneByOrFail({ id: baseDefinition.id });
    for (const field of optionalFields) expect(stored[field], field).toBeNull();

    const resolved = await resolveDefinition();
    expect(resolved).toMatchObject({ id: baseDefinition.id, agentFrameworkConfig: { prompts: [], plugins: [] } });
    expect(resolved).not.toHaveProperty('agentTools');
    expectOmittedOptionalFields(created);
    expectOmittedOptionalFields(await definitions.getAgentDef(baseDefinition.id));
    expectOmittedOptionalFields((await definitions.getAgentDefs())[0]);
  });

  it('keeps optional fields omitted through an update and persisted script save', async () => {
    await definitions.createAgentDef({ ...baseDefinition });
    await reopenDatabase();

    const updated = await definitions.updateAgentDef({ id: baseDefinition.id, name: 'Renamed definition' });
    expect(updated.name).toBe('Renamed definition');
    expectOmittedOptionalFields(updated);
    const source = 'export default function run(ctx) { ctx.finish("saved"); }';
    const scripted = await definitions.saveAgentLoopScript({
      id: baseDefinition.id,
      loopId: 'agent-tool-loop',
      source,
    });
    expectOmittedOptionalFields(scripted, 'agentFrameworkID');
    expect(scripted).toMatchObject({
      loopId: 'agent-tool-loop',
      agentFrameworkID: 'agent-tool-loop',
      scriptReference: { kind: 'source', source },
    });

    await reopenDatabase();
    expectOmittedOptionalFields(await definitions.getAgentDef(baseDefinition.id), 'agentFrameworkID');
    expectOmittedOptionalFields((await definitions.getAgentDefs())[0], 'agentFrameworkID');
    expect(await resolveDefinition()).toMatchObject({
      id: baseDefinition.id,
      agentFrameworkID: 'agent-tool-loop',
      scriptReference: { kind: 'source', source },
      agentFrameworkConfig: { prompts: [], plugins: [] },
    });
  });

  it.each([
    {
      avatarUrl: '',
      agentFrameworkID: '',
      agentFrameworkConfig: { prompts: [], plugins: [] },
      agentTools: [],
      heartbeat: { enabled: false, intervalSeconds: 60, message: '' },
    },
    {
      avatarUrl: 'https://example.test/avatar.png',
      agentFrameworkID: 'agent-tool-loop',
      agentFrameworkConfig: { prompts: [{ id: 'system', role: 'system' as const, text: 'Configured prompt' }], plugins: [] },
      agentTools: [{ toolId: 'wikiSearch', enabled: false, parameters: { limit: 3 } }],
      heartbeat: { enabled: true, intervalSeconds: 60, message: 'Review the calendar' },
    },
  ])('preserves explicit optional configuration after disk reload: $agentFrameworkID', async optionalConfiguration => {
    await definitions.createAgentDef({ ...baseDefinition, ...optionalConfiguration });
    await reopenDatabase();
    expect(await definitions.getAgentDef(baseDefinition.id)).toMatchObject(optionalConfiguration);
    expect((await definitions.getAgentDefs())[0]).toMatchObject(optionalConfiguration);
    expect(await definitions.updateAgentDef({ id: baseDefinition.id, name: 'Configured definition' })).toMatchObject(optionalConfiguration);
  });
});
