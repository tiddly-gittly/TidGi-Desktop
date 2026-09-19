import type { Device } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import type { IDeviceNetworkService } from '@services/deviceNetwork/interface';
import { createDesktopRemoteAgentNetworkContext } from '../runtime/runtime';

function device(peerId: string, trusted: boolean): Device {
  return {
    peerId,
    displayName: peerId,
    platform: 'cli',
    trustMode: 'local-pairing',
    trusted,
    reachability: { state: 'online', paths: ['direct'] },
    capabilities: { tools: [], mcpServers: [], hasWiki: false, agentLoop: true, imChannels: [], wikis: [] },
  };
}

describe('Desktop remote Agent network context', () => {
  it('exposes only paired peers and forwards Agent run, cancel, and log RPC to the exact target', async () => {
    const sendRpc = vi.fn(async (_peerId: string, method: string) => ({ ok: true, method }));
    const service = {
      getLocalIdentity: vi.fn(async () => ({ peerId: 'peer-desktop' })),
      listDevices: vi.fn(async () => [device('peer-cli', true), device('peer-mdns-only', false)]),
      sendRpc,
    } as unknown as IDeviceNetworkService;
    const context = await createDesktopRemoteAgentNetworkContext(service);

    await expect(context.getPeers?.()).resolves.toEqual([device('peer-cli', true)]);
    expect(context.localNodeId).toBe('peer-desktop');

    await context.sendRpcToNode?.('peer-cli', 'memeloop.agent.runTurn', { conversationId: 'conversation-1' });
    await context.sendRpcToNode?.('peer-cli', 'memeloop.agent.cancel', { conversationId: 'conversation-1' });
    await context.sendRpcToNode?.('peer-cli', 'memeloop.chat.pullAgentRunLog', {
      conversationId: 'conversation-1',
      knownMessageIds: [],
    });

    expect(sendRpc).toHaveBeenNthCalledWith(1, 'peer-cli', 'memeloop.agent.runTurn', { conversationId: 'conversation-1' });
    expect(sendRpc).toHaveBeenNthCalledWith(2, 'peer-cli', 'memeloop.agent.cancel', { conversationId: 'conversation-1' });
    expect(sendRpc).toHaveBeenNthCalledWith(3, 'peer-cli', 'memeloop.chat.pullAgentRunLog', {
      conversationId: 'conversation-1',
      knownMessageIds: [],
    });
  });
});
