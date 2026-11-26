import type { TransformableInfo } from 'logform';
import { serializeError } from 'serialize-error';
import winston, { format } from 'winston';
import RendererTransport from './rendererTransport';
import type { LogContext } from './schema';
import StructuredFileTransport, { cleanupExpiredLogFolders, closeStructuredLogStreams } from './structuredFileTransport';
export * from './schema';

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
    new StructuredFileTransport({ level: 'debug' }),
    new RendererTransport(),
  ],
  format: format.combine(errorSerializer(), format.timestamp(), format.json()),
});
export { logger };

export function getLogger(context: LogContext): winston.Logger {
  return logger.child({ logContext: context });
}

void cleanupExpiredLogFolders();

/**
 * Prevent MacOS error `Unhandled Error Error: write EIO at afterWriteDispatched`
 */
export async function destroyLogger(): Promise<void> {
  logger.transports.forEach((t) => {
    if (t) {
      try {
        // May cause `TypeError: Cannot read properties of undefined (reading 'length') at DerivedLogger.remove`
        logger.remove(t);
      } catch (error: unknown) {
        // Logger teardown is intentionally idempotent. Calling the logger from
        // this handler would recurse into the transport being removed, so use
        // an explicit stable fallback instead of emitting another record.
        void error;
      }
    }
  });

  await closeStructuredLogStreams();

  // Prevent `Error: write EIO at afterWriteDispatched (node:internal/stream_base_commons:159:15)`
  console.error = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};
}
