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
    // The main process also captures the original stdout/stderr. Logging again
    // here would re-enter the same interceptor and retry the failed RPC recursively.
  }
}
