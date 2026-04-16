import { logger } from '@services/libs/log';
import type { IMemeloopNodeService } from '@services/memeloopNode/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { inject, injectable } from 'inversify';
import type { TerminalFollowResult, TerminalSessionInfo } from 'memeloop-node/src/terminal/types.js';
import type { IRemoteTerminalService } from './interface';

@injectable()
export class RemoteTerminalService implements IRemoteTerminalService {
  constructor(
    @inject(serviceIdentifier.MemeloopNode) private readonly memeloopNodeService: IMemeloopNodeService,
  ) {}

  async listSessions(nodeId: string): Promise<TerminalSessionInfo[]> {
    try {
      const result = await this.callRemoteRpc<{
        sessions: TerminalSessionInfo[];
      }>(nodeId, 'memeloop.terminal.list', {});
      return result.sessions;
    } catch (error) {
      logger.error('Failed to list terminal sessions', { nodeId, error });
      return [];
    }
  }

  async followSession(
    nodeId: string,
    sessionId: string,
    fromSeq = 1,
    untilExit = false,
    maxWaitMs = 30000,
  ): Promise<TerminalFollowResult> {
    try {
      return await this.callRemoteRpc<TerminalFollowResult>(
        nodeId,
        'memeloop.terminal.follow',
        { sessionId, fromSeq, untilExit, maxWaitMs },
      );
    } catch (error) {
      logger.error('Failed to follow terminal session', {
        nodeId,
        sessionId,
        error,
      });
      throw error;
    }
  }

  async respondToSession(
    nodeId: string,
    sessionId: string,
    input: string,
  ): Promise<{ ok: boolean }> {
    try {
      return await this.callRemoteRpc<{ ok: boolean }>(
        nodeId,
        'memeloop.terminal.respond',
        { sessionId, input },
      );
    } catch (error) {
      logger.error('Failed to send input to terminal session', {
        nodeId,
        sessionId,
        error,
      });
      return { ok: false };
    }
  }

  async cancelSession(
    nodeId: string,
    sessionId: string,
  ): Promise<{ ok: boolean; finalStatus?: string }> {
    try {
      return await this.callRemoteRpc<{ ok: boolean; finalStatus?: string }>(
        nodeId,
        'memeloop.terminal.cancel',
        { sessionId },
      );
    } catch (error) {
      logger.error('Failed to cancel terminal session', {
        nodeId,
        sessionId,
        error,
      });
      return { ok: false };
    }
  }

  async signalSession(
    nodeId: string,
    sessionId: string,
    signal: string,
  ): Promise<{ ok: boolean }> {
    try {
      return await this.callRemoteRpc<{ ok: boolean }>(
        nodeId,
        'memeloop.terminal.signal',
        { sessionId, signal },
      );
    } catch (error) {
      logger.error('Failed to send signal to terminal session', {
        nodeId,
        sessionId,
        signal,
        error,
      });
      return { ok: false };
    }
  }

  private async callRemoteRpc<T>(
    nodeId: string,
    method: string,
    params: unknown,
  ): Promise<T> {
    // TODO: Implement actual RPC call through PeerConnectionManager
    // For now, this is a placeholder that will be implemented when PeerConnectionManager is wired
    throw new Error(`RPC not yet implemented: ${method} to ${nodeId}`);
  }
}
