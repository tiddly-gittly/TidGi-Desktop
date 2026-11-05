/** @vitest-environment node */
import 'reflect-metadata';

import {
  type AgentDefinition,
  type AgentFrameworkContext,
  type AgentLoopStep,
  BUILTIN_AGENT_AGENT_LOOP_QUALITY_GATE_SCRIPT_ID,
  type ConversationEventDraft,
  type ConversationMeta,
  createAgentLoopRunner,
  digestNormalizedScript,
  loadAgentAgentLoopScript,
  normalizeScript,
} from 'memeloop';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentInstanceService } from '@services/agentInstance';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from '@services/database/schema/agent';
import { AgentDefinitionService } from '../index';

let database: DataSource;
let definitions: AgentDefinitionService;

function definition(id: string, overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return { id, name: id, description: id, systemPrompt: '', tools: [], version: '1', ...overrides };
}

beforeEach(async () => {
  database = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity],
    synchronize: true,
  });
  await database.initialize();
  definitions = new AgentDefinitionService();
  Object.assign(definitions, { dataSource: database, agentDefRepository: database.getRepository(AgentDefinitionEntity) });
});

afterEach(async () => {
  await database.destroy();
});

describe('Desktop loop definition persistence and execution', () => {
  it('projects the loop choice from an existing customized Desktop definition', async () => {
    await database.getRepository(AgentDefinitionEntity).save({
      ...definition('previous-customized'),
      agentFrameworkID: 'agent-agent-loop',
      isCustomized: true,
    });
    expect(await definitions.getAgentDef('previous-customized')).toMatchObject({ loopId: 'agent-agent-loop' });
  });

  it('retains builtin loop family, script and metadata on save and reload', async () => {
    const saved = definition('builtin-parent', {
      loopId: 'agent-agent-loop',
      scriptReference: { kind: 'builtin', id: BUILTIN_AGENT_AGENT_LOOP_QUALITY_GATE_SCRIPT_ID },
      metadata: { childProfile: 'child' },
    });
    await definitions.createAgentDef(saved);
    expect(await definitions.getAgentDef(saved.id)).toMatchObject({
      loopId: saved.loopId,
      scriptReference: saved.scriptReference,
      metadata: { childProfile: 'child' },
    });
    await definitions.updateAgentDef({ id: saved.id, metadata: { childProfile: 'other-child' } });
    expect((await definitions.getAgentDef(saved.id))?.metadata).toEqual({ childProfile: 'other-child' });
    expect(typeof await loadAgentAgentLoopScript(saved.scriptReference!, definitions.getLoopScriptPolicy())).toBe('function');
  });

  it('runs saved and reloaded custom mjs through a child loop and its tool', async () => {
    await definitions.createAgentDef(definition('parent'));
    await definitions.createAgentDef(definition('child', { tools: ['wiki-search'] }));
    await definitions.saveAgentLoopScript({
      id: 'parent',
      loopId: 'agent-agent-loop',
      metadata: { childProfile: 'child' },
      source: `export default async function run(ctx) {
        const child = await ctx.runAgent({profile: ctx.profile.metadata.childProfile, prompt: ctx.input.message});
        ctx.finish('parent:' + child.text);
      }`,
    });
    await definitions.saveAgentLoopScript({
      id: 'child',
      loopId: 'agent-tool-loop',
      source: `export default async function run(ctx) {
        const result = await ctx.context.tools.getTool('wiki-search').execute({query: ctx.input.message});
        ctx.finish(result.content);
      }`,
    });
    // Use a fresh service instance to ensure execution reads the persisted projection.
    const reloaded = new AgentDefinitionService();
    Object.assign(reloaded, { dataSource: database, agentDefRepository: database.getRepository(AgentDefinitionEntity) });
    const storage = new AgentInstanceService();
    const conversations = new Map<string, ConversationMeta>();
    Object.assign(storage, {
      getAgentDefinition: async (id: string) => await reloaded.getAgentDef(id) ?? null,
      getConversationMeta: async (id: string) => conversations.get(id) ?? null,
      appendLocalEvent: async (draft: ConversationEventDraft) => {
        if (draft.kind === 'metadataPatch') {
          conversations.set(draft.conversationId, {
            conversationId: draft.conversationId,
            definitionId: draft.patch.definitionId!,
            title: draft.patch.title ?? '',
            lastMessagePreview: '',
            lastMessageTimestamp: 0,
            messageCount: 0,
            originNodeId: draft.originNodeId,
            originClock: 1,
            isUserInitiated: false,
          });
        }
        return { ...draft, originSequence: 1, lamportClock: 1 };
      },
    });
    const execute = vi.fn(async ({ query }: { query: string }) => ({ content: `wiki:${query}` }));
    const tool = { name: 'wiki-search', description: 'Search the test wiki', execute };
    const context: AgentFrameworkContext = {
      storage,
      localNodeId: 'local-test',
      llmProvider: { name: 'unused-script-model', chat: vi.fn() },
      network: { start: vi.fn(), stop: vi.fn() },
      syncAdapters: [],
      tools: {
        registerTool: vi.fn(),
        getTool: id => id === 'wiki-search' ? tool : undefined,
        listTools: () => [tool.name],
      },
      loopScriptPolicy: reloaded.getLoopScriptPolicy(),
    };
    const runner = await createAgentLoopRunner(context, { definitionId: 'parent', conversationId: 'parent-conversation' });
    expect(runner).toBeTruthy();
    const steps: AgentLoopStep[] = [];
    for await (const step of runner!({ conversationId: 'parent-conversation', message: 'calendar' })) steps.push(step);
    expect(execute).toHaveBeenCalledWith({ query: 'calendar' });
    expect(steps).toContainEqual({ type: 'message', data: 'parent:wiki:calendar' });
    expect([...conversations.values()].map(item => item.definitionId)).toContain('child');
  });

  it('keeps imported source separate from a local source approval and revokes replaced source', async () => {
    const source = 'export default function run(ctx) { ctx.finish("ready"); }';
    const reference = { kind: 'source' as const, source };
    await definitions.createAgentDef(definition('imported', { loopId: 'agent-agent-loop', scriptReference: reference }));
    const digest = await digestNormalizedScript(normalizeScript(source));
    const request = { normalizedSource: normalizeScript(source), digest, reference, scriptType: 'test' };
    const policy = definitions.getLoopScriptPolicy();
    expect(await policy.scriptLoadGate!.admitScriptLoad(request)).toMatchObject({ allowed: false });
    const saved = await definitions.saveAgentLoopScript({ id: 'imported', loopId: 'agent-agent-loop', source });
    expect(saved).not.toHaveProperty('approvedScriptDigest');
    expect((await definitions.getAgentDefs())[0]).not.toHaveProperty('approvedScriptDigest');
    expect(await policy.scriptLoadGate!.admitScriptLoad(request)).toMatchObject({ allowed: true });
    // An unrelated autosave keeps the approval; a new executable source requires applying that source.
    await definitions.updateAgentDef({ id: 'imported', name: 'Renamed' });
    expect(await policy.scriptLoadGate!.admitScriptLoad(request)).toMatchObject({ allowed: true });
    await definitions.updateAgentDef({ id: 'imported', scriptReference: { ...reference, source: `${source}\n// changed` } });
    expect(await policy.scriptLoadGate!.admitScriptLoad(request)).toMatchObject({ allowed: false });
  });
});
