import { LOG_FOLDER } from '@/constants/appPaths';
import { serializeError } from 'serialize-error';
import winston, { format } from 'winston';
import 'winston-daily-rotate-file';
import type { TransformableInfo } from 'logform';
import RendererTransport from './rendererTransport';

export * from './wikiOutput';

/**
 * Custom formatter to serialize Error objects using serialize-error package.
 * Falls back to template string if serialization fails.
 */
const errorSerializer = format((info: TransformableInfo) => {
  const infoRecord = info as Record<string, unknown>;

  // Serialize error objects
  if (infoRecord.error instanceof Error) {
    try {
      infoRecord.error = serializeError(infoRecord.error);
    } catch {
      // Fallback to template string with optional chaining
      const error = infoRecord.error as Error;
      infoRecord.error = `${error?.message ?? ''} stack: ${error?.stack ?? ''}`;
    }
  }
  return info;
});

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: 'TidGi-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxSize: '20mb',
      maxFiles: '14d',
      dirname: LOG_FOLDER,
      level: 'debug',
    }),
    new RendererTransport(),
  ],
  format: format.combine(errorSerializer(), format.timestamp(), format.json()),
});
export { logger };

/**
 * Store for labeled loggers (e.g., per-wiki loggers)
 */
const labeledLoggers = new Map<string, winston.Logger>();

/**
 * Get or create a logger for a specific label (e.g., wiki name)
 * Each labeled logger writes to its own log file
 * @param label The label for the logger (e.g., wiki workspace name)
 * @returns A winston logger instance for the specified label
 */
export function getLoggerForLabel(label: string): winston.Logger {
  const existingLogger = labeledLoggers.get(label);
  if (existingLogger) {
    return existingLogger;
  }

  // Create new logger for this label
  const labeledLogger = winston.createLogger({
    transports: [
      new winston.transports.Console(),
      new winston.transports.DailyRotateFile({
        filename: `${label}-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: false,
        maxSize: '20mb',
        maxFiles: '14d',
        dirname: LOG_FOLDER,
        level: 'debug',
      }),
    ],
    format: format.combine(errorSerializer(), format.label({ label }), format.timestamp(), format.json()),
  });

  labeledLoggers.set(label, labeledLogger);
  return labeledLogger;
}

/**
 * Prevent MacOS error `Unhandled Error Error: write EIO at afterWriteDispatched`
 */
export function destroyLogger(): void {
  logger.transports.forEach((t) => {
    if (t) {
      try {
        // May cause `TypeError: Cannot read properties of undefined (reading 'length') at DerivedLogger.remove`
        logger.remove(t);
        // eslint-disable-next-line no-empty
      } catch {}
    }
  });

  // Destroy all labeled loggers
  for (const [label, labeledLogger] of labeledLoggers.entries()) {
    labeledLogger.transports.forEach((t) => {
      if (t) {
        try {
          labeledLogger.remove(t);
          // eslint-disable-next-line no-empty
        } catch {}
      }
    });
    labeledLoggers.delete(label);
  }

  // Prevent `Error: write EIO at afterWriteDispatched (node:internal/stream_base_commons:159:15)`
  console.error = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};
}
