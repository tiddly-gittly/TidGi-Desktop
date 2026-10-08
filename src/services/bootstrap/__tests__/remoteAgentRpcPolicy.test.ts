import type { DeviceRpcHandlerInput } from 'memeloop';
import { describe, expect, it, vi } from 'vitest';

import { protectRemoteAgentRpcHandler } from '../remoteAgentRpcPolicy';

function request(remotePeerId: string, message: string, method = 'memeloop.agent.send'): DeviceRpcHandlerInput {
  return {
    remotePeerId,
    method,
    parameters: { conversationId: 'conversation-1', message },
  };
}

describe('protectRemoteAgentRpcHandler', () => {
  it('measures the remote message as UTF-8 bytes before invoking the runtime', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const protectedHandler = protectRemoteAgentRpcHandler(handler, { maxMessageBytes: 4 });

    await expect(protectedHandler(request('peer-a', '你好'))).rejects.toThrow('remote_agent_message_too_large:4');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rate limits Agent turns independently for each peer and recovers after the window', async () => {
    let now = 1_000;
    const handler = vi.fn(async () => ({ ok: true }));
    const protectedHandler = protectRemoteAgentRpcHandler(handler, {
      maxRequestsPerWindow: 2,
      now: () => now,
      windowMs: 1_000,
    });

    await protectedHandler(request('peer-a', 'first'));
    await protectedHandler(request('peer-a', 'second', 'memeloop.agent.runTurn'));
    await expect(protectedHandler(request('peer-a', 'third'))).rejects.toThrow('remote_agent_rate_limited:2:1000');
    await expect(protectedHandler(request('peer-b', 'independent'))).resolves.toEqual({ ok: true });

    now += 1_001;
    await expect(protectedHandler(request('peer-a', 'after-window'))).resolves.toEqual({ ok: true });
  });

  it('does not interfere with non-executing Agent RPC methods', async () => {
    const handler = vi.fn(async () => ({ definitions: [] }));
    const protectedHandler = protectRemoteAgentRpcHandler(handler, { maxRequestsPerWindow: 0 });

    await expect(protectedHandler({
      remotePeerId: 'peer-a',
      method: 'memeloop.agent.getDefinitions',
      parameters: {},
    })).resolves.toEqual({ definitions: [] });
  });

  it('also limits remote conversation creation before it can allocate an initial Agent turn', async () => {
    const handler = vi.fn(async () => ({ conversationId: 'conversation-1' }));
    const protectedHandler = protectRemoteAgentRpcHandler(handler, { maxRequestsPerWindow: 1 });
    const input: DeviceRpcHandlerInput = {
      remotePeerId: 'peer-a',
      method: 'memeloop.agent.create',
      parameters: { definitionId: 'definition-1', initialMessage: 'start' },
    };

    await expect(protectedHandler(input)).resolves.toEqual({ conversationId: 'conversation-1' });
    await expect(protectedHandler(input)).rejects.toThrow('remote_agent_rate_limited:1:60000');
  });
});
