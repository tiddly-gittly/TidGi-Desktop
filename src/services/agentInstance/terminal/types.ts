/**
 * Terminal session types for ITerminalSessionManager.
 *
 * This is a desktop-side implementation to support long-running commands with:
 * - stdout/stderr streaming chunks (via follow)
 * - interactive stdin respond
 * - remote follow/cancel/list
 *
 * Implementation is adapted from memeloop-node's terminal module.
 */

export type TerminalSessionStatus = "running" | "exited" | "killed" | "failed";

export interface TerminalSessionInfo {
  sessionId: string;
  command: string;
  cwd: string;
  status: TerminalSessionStatus;
  exitCode: number | null;
  startedAt: number;
  exitedAt?: number;
}

export interface TerminalOutputChunk {
  sessionId: string;
  seq: number;
  stream: "stdout" | "stderr";
  data: string;
  ts: number;
}

export interface TerminalInteractionPrompt {
  sessionId: string;
  promptText: string;
  /**
   * Matched regex pattern name if configured.
   * (Optional, used to route different prompts to different UIs)
   */
  patternName?: string;
  timestamp: number;
}

export interface TerminalFollowResult {
  sessionId: string;
  status: TerminalSessionStatus;
  exitCode: number | null;
  nextSeq: number;
  done: boolean;
  chunks: TerminalOutputChunk[];
}

