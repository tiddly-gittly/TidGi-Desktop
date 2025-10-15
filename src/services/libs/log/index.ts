import { LOG_FOLDER } from '@/constants/appPaths';
import winston, { format } from 'winston';
import 'winston-daily-rotate-file';
import type { TransformableInfo } from 'logform';
import RendererTransport from './rendererTransport';

export * from './wikiOutput';
/**
 * Custom formatter to serialize Error objects into a string with message and stack.
 * It looks for fields named `error` or any property whose value is an Error instance
 * and replaces it with a string: `${message} stack: ${stack}`.
 */
const errorSerializer = format((info: TransformableInfo) => {
  function serializeError(value: unknown): unknown {
    if (value instanceof Error) {
      return `${value.message} stack: ${value.stack ?? ''}`;
    }
    if (Array.isArray(value)) {
      return value.map(serializeError);
    }
    if (value && typeof value === 'object') {
      const objectResult: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        objectResult[k] = serializeError(v);
      }
      return objectResult;
    }
    return value;
  }

  // common convention: info.error
  const infoRecord = info as Record<string, unknown>;
  if (infoRecord.error) {
    infoRecord.error = serializeError(infoRecord.error);
  }

  // serialize any other Error instances in meta/info
  for (const key of Object.keys(infoRecord)) {
    const value = infoRecord[key];
    if (value instanceof Error) {
      infoRecord[key] = serializeError(value);
    } else if (typeof value === 'object' && value !== null) {
      infoRecord[key] = serializeError(value);
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
  // Prevent `Error: write EIO at afterWriteDispatched (node:internal/stream_base_commons:159:15)`
  console.error = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};
}
