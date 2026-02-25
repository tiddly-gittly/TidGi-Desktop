/**
 * Parallel Tool Execution
 *
 * Executes multiple tool calls concurrently with per-tool timeout and
 * collects both success and failure results (like Promise.allSettled, not Promise.all).
 */
import type { ToolCallingMatch } from '@services/agentDefinition/interface';
import { logger } from '@services/libs/log';
import type { ToolExecutionResult } from './defineTool';

/** Default per-tool timeout (30 seconds) */
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;
/** Global timeout for the entire parallel batch */
const DEFAULT_BATCH_TIMEOUT_MS = 120_000;

export interface ToolCallEntry {
  call: ToolCallingMatch & { found: true };
  executor: (parameters: Record<string, unknown>) => Promise<ToolExecutionResult>;
  timeoutMs?: number;
}

export interface ToolCallResult {
  call: ToolCallingMatch & { found: true };
  status: 'fulfilled' | 'rejected' | 'timeout';
  result?: ToolExecutionResult;
  error?: string;
}

/**
 * Execute a single tool call with timeout.
 */
async function executeWithTimeout(
  entry: ToolCallEntry,
): Promise<ToolCallResult> {
  const timeoutMs = entry.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

  return new Promise<ToolCallResult>((resolve) => {
    let settled = false;

    const timer = timeoutMs > 0
      ? setTimeout(() => {
        if (!settled) {
          settled = true;
          logger.warn('Tool call timed out', { toolId: entry.call.toolId, timeoutMs });
          resolve({
            call: entry.call,
            status: 'timeout',
            error: `Tool "${entry.call.toolId}" timed out after ${timeoutMs}ms`,
          });
        }
      }, timeoutMs)
      : undefined;

    entry.executor(entry.call.parameters ?? {})
      .then((result) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve({ call: entry.call, status: 'fulfilled', result });
        }
      })
      .catch((error: unknown) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          resolve({
            call: entry.call,
            status: 'rejected',
            result: { success: false, error: error instanceof Error ? error.message : String(error) },
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
  });
}

/**
 * Execute multiple tool calls in parallel.
 * All calls run concurrently; failures/timeouts do NOT cancel others.
 * Returns results for ALL calls (including failures/timeouts).
 *
 * @param entries - Array of tool call entries to execute
 * @param batchTimeoutMs - Overall batch timeout (0 = no batch timeout)
 */
export async function executeToolCallsParallel(
  entries: ToolCallEntry[],
  batchTimeoutMs: number = DEFAULT_BATCH_TIMEOUT_MS,
): Promise<ToolCallResult[]> {
  if (entries.length === 0) return [];
  if (entries.length === 1) {
    // Optimization: single call, no need for parallel machinery
    return [await executeWithTimeout(entries[0])];
  }

  logger.debug('Executing tool calls in parallel', {
    count: entries.length,
    tools: entries.map(entry => entry.call.toolId),
    batchTimeoutMs,
  });

  // Start all executions concurrently
  const promises = entries.map(entry => executeWithTimeout(entry));

  // Apply batch timeout
  if (batchTimeoutMs > 0) {
    const batchTimer = new Promise<ToolCallResult[]>((resolve) => {
      setTimeout(() => {
        logger.warn('Parallel tool batch timed out', { batchTimeoutMs });
        // Return what we have — individual timeouts should have already fired
        resolve(entries.map(entry => ({
          call: entry.call,
          status: 'timeout' as const,
          error: `Batch timeout: ${batchTimeoutMs}ms exceeded`,
        })));
      }, batchTimeoutMs);
    });

    return Promise.race([
      Promise.all(promises),
      batchTimer,
    ]);
  }

  return Promise.all(promises);
}

/**
 * Execute tool calls sequentially (for non-parallel mode).
 */
export async function executeToolCallsSequential(
  entries: ToolCallEntry[],
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];
  for (const entry of entries) {
    results.push(await executeWithTimeout(entry));
  }
  return results;
}
