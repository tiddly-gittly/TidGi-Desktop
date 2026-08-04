import type { LogContext, LogLevel } from '@services/libs/log/schema';

export interface WorkerLogSink {
  logFor(
    context: LogContext,
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<void>;
}

/**
 * Worker logging must never participate in Wiki availability.
 *
 * The main-process logging RPC can be delayed while a UtilityProcess is
 * starting or shutting down. A timeout is useful to release the RPC slot, but
 * allowing that rejection to escape would make the worker's global
 * unhandled-rejection handler terminate an otherwise healthy Wiki process.
 */
export async function logForBestEffort(
  sink: WorkerLogSink,
  context: LogContext,
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await sink.logFor(context, level, message, meta);
  } catch {
    // stdout/stderr interception still returns the original message to the
    // underlying stream, which the main process captures independently. Do
    // not write a fallback console message here: it would re-enter the same
    // interceptor and recursively attempt the failed logging RPC.
  }
}
