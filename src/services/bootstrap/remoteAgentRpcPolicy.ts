import type { DeviceRpcHandler } from 'memeloop';

export const REMOTE_AGENT_MESSAGE_MAX_BYTES = 1024 * 1024;
export const REMOTE_AGENT_RATE_LIMIT = 20;
export const REMOTE_AGENT_RATE_WINDOW_MS = 60_000;

const guardedMethods = new Set([
  'memeloop.agent.create',
  'memeloop.agent.send',
  'memeloop.agent.runTurn',
  'memeloop.schedule.create',
  'memeloop.schedule.update',
  'memeloop.schedule.delete',
]);

/**
 * Applies host-side resource limits after device authorization but before an
 * inbound request can allocate an Agent turn or consume an LLM request.
 */
export function protectRemoteAgentRpcHandler(
  handler: DeviceRpcHandler,
  options: {
    now?: () => number;
    maxMessageBytes?: number;
    maxRequestsPerWindow?: number;
    windowMs?: number;
  } = {},
): DeviceRpcHandler {
  const now = options.now ?? (() => Date.now());
  const maxMessageBytes = options.maxMessageBytes ?? REMOTE_AGENT_MESSAGE_MAX_BYTES;
  const maxRequestsPerWindow = options.maxRequestsPerWindow ?? REMOTE_AGENT_RATE_LIMIT;
  const windowMs = options.windowMs ?? REMOTE_AGENT_RATE_WINDOW_MS;
  const requestsByPeer = new Map<string, number[]>();

  return async input => {
    if (!guardedMethods.has(input.method)) return handler(input);

    const message = getMessage(input.parameters);
    if (Buffer.byteLength(message, 'utf8') > maxMessageBytes) {
      throw new Error(`remote_agent_message_too_large:${maxMessageBytes}`);
    }

    const timestamp = now();
    const windowStart = timestamp - windowMs;
    const recentRequests = (requestsByPeer.get(input.remotePeerId) ?? [])
      .filter(requestAt => requestAt > windowStart);
    if (recentRequests.length >= maxRequestsPerWindow) {
      requestsByPeer.set(input.remotePeerId, recentRequests);
      throw new Error(`remote_agent_rate_limited:${maxRequestsPerWindow}:${windowMs}`);
    }
    recentRequests.push(timestamp);
    requestsByPeer.set(input.remotePeerId, recentRequests);

    return handler(input);
  };
}

function getMessage(parameters: unknown): string {
  if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new Error('invalid_rpc_params');
  }
  const record = parameters as Record<string, unknown>;
  const message = record.message ?? record.initialMessage ??
    (record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>).message
      : undefined) ??
    JSON.stringify(record);
  if (typeof message !== 'string') throw new Error('invalid_rpc_params');
  return message;
}
