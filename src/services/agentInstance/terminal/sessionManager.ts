/**
 * ITerminalSessionManager: start/manage long-running commands, stream stdout/stderr,
 * stdin write, interaction detection (timeout + regex prompt), process lifecycle, session list.
 *
 * Implementation is adapted from memeloop-node's terminal module, but packaged for TidGi Desktop.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

import type { TerminalFollowResult, TerminalInteractionPrompt, TerminalOutputChunk, TerminalSessionInfo, TerminalSessionStatus } from './types';

export interface StartSessionOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /**
   * Regex patterns to detect "prompt" (e.g. ">$ ", "Password:") for interaction detection.
   */
  promptPatterns?: { name: string; regex: RegExp }[];
  /**
   * If no output for this many ms, emit interaction prompt (optional).
   * (For typical interactive prompts, promptPatterns are still required.)
   */
  idleTimeoutMs?: number;
}

export interface ITerminalSessionManager {
  start(options: StartSessionOptions): Promise<{ sessionId: string }>;
  list(): Promise<TerminalSessionInfo[]>;
  get(sessionId: string): TerminalSessionInfo | undefined;
  respond(sessionId: string, input: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  signal(sessionId: string, signal: NodeJS.Signals): Promise<void>;
  getOutputText(
    sessionId: string,
    opts?: { tailLines?: number; tailChars?: number },
  ): string;
  follow(
    sessionId: string,
    options?: { fromSeq?: number; untilExit?: boolean; maxWaitMs?: number },
  ): Promise<TerminalFollowResult>;
  getChunksSince(sessionId: string, fromSeq?: number): TerminalOutputChunk[];
  onOutput(listener: (chunk: TerminalOutputChunk) => void): () => void;
  onStatusUpdate(
    listener: (update: {
      sessionId: string;
      status: TerminalSessionStatus;
      exitCode: number | null;
      ts: number;
    }) => void,
  ): () => void;
  onInteractionPrompt(
    listener: (prompt: TerminalInteractionPrompt) => void,
  ): () => void;
  onSessionComplete(
    listener: (
      sessionId: string,
      info: TerminalSessionInfo,
      truncatedOutput: string,
    ) => void,
  ): () => void;
}

interface SessionState {
  sessionId: string;
  command: string;
  cwd: string;
  status: TerminalSessionStatus;
  exitCode: number | null;
  startedAt: number;
  process: ChildProcess;
  idleTimer?: ReturnType<typeof setTimeout>;
  promptPatterns?: { name: string; regex: RegExp }[];
  idleTimeoutMs?: number;
  buffer: string;
  chunks: TerminalOutputChunk[];
  nextSeq: number;
}

export class TerminalSessionManager extends EventEmitter implements ITerminalSessionManager {
  private sessions = new Map<string, SessionState>();
  private outputListeners = new Set<(chunk: TerminalOutputChunk) => void>();
  private statusListeners = new Set<
    (update: {
      sessionId: string;
      status: TerminalSessionStatus;
      exitCode: number | null;
      ts: number;
    }) => void
  >();
  private promptListeners = new Set<
    (prompt: TerminalInteractionPrompt) => void
  >();
  private sessionCompleteListeners = new Set<
    (
      sessionId: string,
      info: TerminalSessionInfo,
      truncatedOutput: string,
    ) => void
  >();
  private readonly maxChunksPerSession: number;

  constructor(options?: { maxChunksPerSession?: number }) {
    super();
    this.maxChunksPerSession = Math.max(
      2000,
      options?.maxChunksPerSession ?? 4000,
    );
  }

  async start(options: StartSessionOptions): Promise<{ sessionId: string }> {
    const sessionId = crypto.randomUUID();
    const cwd = options.cwd ?? process.cwd();
    const args = options.args ?? [];
    const env = { ...process.env, ...options.env };

    const proc = spawn(options.command, args, {
      cwd,
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const state: SessionState = {
      sessionId,
      command: [options.command, ...args].join(' '),
      cwd,
      status: 'running',
      exitCode: null,
      startedAt: Date.now(),
      process: proc,
      promptPatterns: options.promptPatterns,
      idleTimeoutMs: options.idleTimeoutMs,
      buffer: '',
      chunks: [],
      nextSeq: 1,
    };

    this.sessions.set(sessionId, state);

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.pushOutput(sessionId, 'stdout', text, state);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.pushOutput(sessionId, 'stderr', text, state);
    });

    proc.on('exit', (code, signal) => {
      const s = this.sessions.get(sessionId);
      if (!s) return;
      s.status = signal ? 'killed' : 'exited';
      s.exitCode = code;
      if (s.idleTimer) clearTimeout(s.idleTimer);
      this.emitStatusUpdate(sessionId, s.status, s.exitCode);
    });

    proc.on('error', () => {
      const s = this.sessions.get(sessionId);
      if (s) {
        s.status = 'failed';
        this.emitStatusUpdate(sessionId, s.status, s.exitCode);
      }
    });

    if (options.idleTimeoutMs) {
      this.scheduleIdlePrompt(sessionId, state);
    }

    return { sessionId };
  }

  private pushOutput(
    sessionId: string,
    stream: 'stdout' | 'stderr',
    text: string,
    state: SessionState,
  ): void {
    const seq = state.nextSeq++;
    const ts = Date.now();
    const chunk: TerminalOutputChunk = {
      sessionId,
      seq,
      stream,
      data: text,
      ts,
    };

    state.chunks.push(chunk);
    if (state.chunks.length > this.maxChunksPerSession) {
      state.chunks.splice(0, state.chunks.length - this.maxChunksPerSession);
    }

    for (const fn of this.outputListeners) fn(chunk);

    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = undefined;
    }

    state.buffer += text;

    if (state.promptPatterns?.length) {
      for (const { name, regex } of state.promptPatterns) {
        if (regex.test(state.buffer)) {
          const prompt: TerminalInteractionPrompt = {
            sessionId,
            promptText: state.buffer.slice(-200),
            patternName: name,
            timestamp: ts,
          };
          for (const fn of this.promptListeners) fn(prompt);
          state.buffer = '';
          break;
        }
      }
    }

    if (state.idleTimeoutMs) {
      this.scheduleIdlePrompt(sessionId, state);
    }
  }

  private scheduleIdlePrompt(sessionId: string, state: SessionState): void {
    if (state.status !== 'running' || !state.idleTimeoutMs) return;
    state.idleTimer = setTimeout(() => {
      state.idleTimer = undefined;
      const prompt: TerminalInteractionPrompt = {
        sessionId,
        promptText: state.buffer || '(no output yet)',
        timestamp: Date.now(),
      };
      for (const fn of this.promptListeners) fn(prompt);
    }, state.idleTimeoutMs);
  }

  async list(): Promise<TerminalSessionInfo[]> {
    return Array.from(this.sessions.values()).map((s) => this.toInfo(s));
  }

  get(sessionId: string): TerminalSessionInfo | undefined {
    const s = this.sessions.get(sessionId);
    return s ? this.toInfo(s) : undefined;
  }

  getChunksSince(sessionId: string, fromSeq = 1): TerminalOutputChunk[] {
    const s = this.sessions.get(sessionId);
    if (!s) return [];
    return s.chunks.filter((c) => c.seq >= fromSeq);
  }

  private toInfo(s: SessionState): TerminalSessionInfo {
    return {
      sessionId: s.sessionId,
      command: s.command,
      cwd: s.cwd,
      status: s.status,
      exitCode: s.exitCode,
      startedAt: s.startedAt,
      exitedAt: undefined,
    };
  }

  async respond(sessionId: string, input: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Session not found: ${sessionId}`);
    if (s.status !== 'running' || !s.process.stdin?.writable) {
      throw new Error(`Session not writable: ${sessionId}`);
    }
    s.process.stdin.write(input + '\n');
  }

  async cancel(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    if (s.idleTimer) {
      clearTimeout(s.idleTimer);
      s.idleTimer = undefined;
    }
    s.process.kill('SIGTERM');
    s.status = 'killed';
    this.emitStatusUpdate(sessionId, s.status, s.exitCode);
  }

  async follow(
    sessionId: string,
    options?: { fromSeq?: number; untilExit?: boolean; maxWaitMs?: number },
  ): Promise<TerminalFollowResult> {
    const fromSeq = Math.max(1, options?.fromSeq ?? 1);
    const untilExit = options?.untilExit === true;
    const maxWaitMs = options?.maxWaitMs ?? 30_000;
    const maxUntil = maxWaitMs > 0 ? Date.now() + maxWaitMs : Number.POSITIVE_INFINITY;

    while (true) {
      const state = this.sessions.get(sessionId);
      if (!state) throw new Error(`Session not found: ${sessionId}`);

      const chunks = state.chunks.filter((chunk) => chunk.seq >= fromSeq);
      const done = state.status !== 'running';

      if (!untilExit || done || chunks.length > 0 || Date.now() >= maxUntil) {
        return {
          sessionId,
          status: state.status,
          exitCode: state.exitCode,
          nextSeq: state.nextSeq,
          done,
          chunks,
        };
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  onOutput(listener: (chunk: TerminalOutputChunk) => void): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  onStatusUpdate(
    listener: (update: {
      sessionId: string;
      status: TerminalSessionStatus;
      exitCode: number | null;
      ts: number;
    }) => void,
  ): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onInteractionPrompt(
    listener: (prompt: TerminalInteractionPrompt) => void,
  ): () => void {
    this.promptListeners.add(listener);
    return () => this.promptListeners.delete(listener);
  }

  signal(sessionId: string, signal: NodeJS.Signals): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return Promise.reject(new Error(`Session not found: ${sessionId}`));
    s.process.kill(signal);
    return Promise.resolve();
  }

  getOutputText(
    sessionId: string,
    opts?: { tailLines?: number; tailChars?: number },
  ): string {
    const s = this.sessions.get(sessionId);
    if (!s) return '';
    const fullText = s.chunks.map((c) => c.data).join('');
    if (opts?.tailChars) {
      return fullText.slice(-opts.tailChars);
    }
    if (opts?.tailLines) {
      const lines = fullText.split('\n');
      return lines.slice(-opts.tailLines).join('\n');
    }
    return fullText;
  }

  onSessionComplete(
    listener: (
      sessionId: string,
      info: TerminalSessionInfo,
      truncatedOutput: string,
    ) => void,
  ): () => void {
    this.sessionCompleteListeners.add(listener);
    return () => this.sessionCompleteListeners.delete(listener);
  }

  private emitStatusUpdate(
    sessionId: string,
    status: TerminalSessionStatus,
    exitCode: number | null,
  ): void {
    const payload = { sessionId, status, exitCode, ts: Date.now() };
    for (const fn of this.statusListeners) fn(payload);
  }
}

// Singleton used by agent tools.
export const terminalSessionManager = new TerminalSessionManager();
