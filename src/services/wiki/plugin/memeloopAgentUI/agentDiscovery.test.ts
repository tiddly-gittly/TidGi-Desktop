import { describe, expect, it, vi } from 'vitest';
import { resolveWikiAgentId, type WikiAgentDiscoveryService } from './agentDiscovery';

describe('resolveWikiAgentId', () => {
  it('uses an explicit or existing identity without creating an agent', async () => {
    const service: WikiAgentDiscoveryService = {
      getAgents: vi.fn(async () => [{ id: 'existing' }]),
      createAgent: vi.fn(async () => ({ id: 'created' })),
    };
    await expect(resolveWikiAgentId('explicit', service)).resolves.toBe('explicit');
    await expect(resolveWikiAgentId(undefined, service)).resolves.toBe('existing');
    expect(service.createAgent).not.toHaveBeenCalled();
  });

  it('single-flights creation across simultaneously mounted full and sidebar views', async () => {
    let resolveCreation!: (agent: { id: string }) => void;
    const service: WikiAgentDiscoveryService = {
      getAgents: vi.fn(async () => []),
      createAgent: vi.fn(() =>
        new Promise<{ id: string }>(resolve => {
          resolveCreation = resolve;
        })
      ),
    };
    const full = resolveWikiAgentId(undefined, service);
    const sidebar = resolveWikiAgentId(undefined, service);
    await vi.waitFor(() => {
      expect(service.createAgent).toHaveBeenCalledTimes(1);
    });
    resolveCreation({ id: 'one-agent' });
    await expect(Promise.all([full, sidebar])).resolves.toEqual(['one-agent', 'one-agent']);
    expect(service.getAgents).toHaveBeenCalledTimes(1);
  });

  it('single-flights the discovery query as well as the creation', async () => {
    let resolveDiscovery!: (agents: readonly { id: string }[]) => void;
    const service: WikiAgentDiscoveryService = {
      getAgents: vi.fn(() =>
        new Promise<readonly { id: string }[]>(resolve => {
          resolveDiscovery = resolve;
        })
      ),
      createAgent: vi.fn(async () => ({ id: 'created-once' })),
    };
    const full = resolveWikiAgentId(undefined, service);
    const sidebar = resolveWikiAgentId(undefined, service);
    expect(service.getAgents).toHaveBeenCalledTimes(1);
    resolveDiscovery([]);
    await expect(Promise.all([full, sidebar])).resolves.toEqual(['created-once', 'created-once']);
    expect(service.createAgent).toHaveBeenCalledTimes(1);
  });

  it('does not poison later mounts when a creation attempt fails', async () => {
    const createAgent = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 'recovered' });
    const service: WikiAgentDiscoveryService = {
      getAgents: vi.fn(async () => []),
      createAgent,
    };
    await expect(resolveWikiAgentId(undefined, service)).rejects.toThrow('offline');
    await expect(resolveWikiAgentId(undefined, service)).resolves.toBe('recovered');
    expect(createAgent).toHaveBeenCalledTimes(2);
  });
});
