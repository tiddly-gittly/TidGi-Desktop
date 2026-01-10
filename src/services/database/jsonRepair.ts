/**
 * Shared JSON parsing and repair utilities.
 * Uses best-effort-json-parser to recover from malformed JSON files.
 *
 * ⚠️ NOTE: This file must NOT import logger or any module that transitively imports 'electron'
 * because it may be used by tidgiConfig.ts which is bundled with Worker code.
 * Logger is injected via initJsonRepairLogger() to avoid this issue.
 */
import { parse as bestEffortJsonParser } from 'best-effort-json-parser';
import fs from 'fs-extra';

/**
 * Logger interface - minimal subset of winston logger
 */
interface ILogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Injected logger instance. Falls back to console if not initialized.
 */
let injectedLogger: ILogger | undefined;

/**
 * Initialize the logger for jsonRepair module.
 * This should be called early in the main process initialization.
 * @param loggerInstance The logger instance to use (typically from @services/libs/log)
 */
export function initJsonRepairLogger(loggerInstance: ILogger): void {
  injectedLogger = loggerInstance;
}

/**
 * Get the logger, falling back to console if not initialized
 */
function getLogger(): ILogger {
  if (injectedLogger) {
    return injectedLogger;
  }
  // Fallback to console for cases where logger is not initialized
  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      console.info(message, meta);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      console.warn(message, meta);
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      console.error(message, meta);
    },
  };
}

/**
 * Parse JSON content with automatic repair for malformed JSON.
 * If parsing fails, attempts to repair using best-effort-json-parser.
 *
 * @param content - The JSON string to parse
 * @param filePath - Path to the file (for logging and optional write-back)
 * @param options - Configuration options
 * @returns Parsed object or undefined if parsing and repair both fail
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function parseJsonWithRepair<T = unknown>(
  content: string,
  filePath: string,
  options: {
    /** Whether to write the repaired JSON back to the file */
    writeBack?: boolean;
    /** Whether to use sync file operations (default: false) */
    sync?: boolean;
    /** Custom log prefix for error messages */
    logPrefix?: string;
  } = {},
): T | undefined {
  const { writeBack = true, sync = false, logPrefix = 'JSON file' } = options;

  try {
    return JSON.parse(content) as T;
  } catch (jsonError) {
    getLogger().warn(`${logPrefix} format error, attempting to fix`, {
      filePath,
      error: (jsonError as Error).message,
    });

    try {
      const repaired = bestEffortJsonParser(content) as T;

      if (writeBack) {
        const repairedContent = JSON.stringify(repaired, null, 2);
        if (sync) {
          fs.writeFileSync(filePath, repairedContent, 'utf-8');
        } else {
          void fs.writeFile(filePath, repairedContent, 'utf-8');
        }
        getLogger().info(`Successfully repaired ${logPrefix}`, { filePath });
      }

      return repaired;
    } catch (fixError) {
      getLogger().error(`Failed to repair ${logPrefix}`, {
        filePath,
        error: (fixError as Error).message,
      });
      return undefined;
    }
  }
}

/**
 * Parse JSON content synchronously with automatic repair.
 * Convenience wrapper for parseJsonWithRepair with sync=true.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function parseJsonWithRepairSync<T = unknown>(
  content: string,
  filePath: string,
  options: Omit<Parameters<typeof parseJsonWithRepair>[2], 'sync'> = {},
): T | undefined {
  return parseJsonWithRepair<T>(content, filePath, { ...options, sync: true });
}
