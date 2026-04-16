import { RemoteTerminalChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import type { TerminalFollowResult, TerminalOutputChunk, TerminalSessionInfo } from 'memeloop-node/src/terminal/types.js';

export interface IRemoteTerminalService {
  /**
   * List all terminal sessions on a remote node
   */
  listSessions(nodeId: string): Promise<TerminalSessionInfo[]>;

  /**
   * Follow a terminal session and get output chunks
   */
  followSession(
    nodeId: string,
    sessionId: string,
    fromSeq?: number,
    untilExit?: boolean,
    maxWaitMs?: number,
  ): Promise<TerminalFollowResult>;

  /**
   * Send input (stdin) to a terminal session
   */
  respondToSession(
    nodeId: string,
    sessionId: string,
    input: string,
  ): Promise<{ ok: boolean }>;

  /**
   * Cancel (kill) a terminal session
   */
  cancelSession(
    nodeId: string,
    sessionId: string,
  ): Promise<{ ok: boolean; finalStatus?: string }>;

  /**
   * Send a signal to a terminal session
   */
  signalSession(
    nodeId: string,
    sessionId: string,
    signal: string,
  ): Promise<{ ok: boolean }>;
}

export const RemoteTerminalServiceIPCDescriptor = {
  channel: RemoteTerminalChannel.name,
  properties: {
    listSessions: ProxyPropertyType.Function,
    followSession: ProxyPropertyType.Function,
    respondToSession: ProxyPropertyType.Function,
    cancelSession: ProxyPropertyType.Function,
    signalSession: ProxyPropertyType.Function,
  },
};
