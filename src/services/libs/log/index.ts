import { LOG_FOLDER } from '@/constants/appPaths';
import winston, { format } from 'winston';
import RendererTransport from './rendererTransport';
import 'winston-daily-rotate-file';

export * from './wikiOutput';

const logger = (
  process.env.NODE_ENV === 'test'
    ? Object.assign(console, {
      emerg: console.error.bind(console),
      alert: console.error.bind(console),
      debug: console.log.bind(console),
      close: () => {},
    })
    : winston.createLogger({
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
      exceptionHandlers: [
        new winston.transports.DailyRotateFile({
          filename: 'TidGi-Exception-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: false,
          maxSize: '20mb',
          maxFiles: '14d',
          dirname: LOG_FOLDER,
        }),
      ],
      format: format.combine(format.timestamp(), format.json()),
    })
) as winston.Logger;
export { logger };

export function destroyLogger(): void {
  logger.close();
  logger.removeAllListeners();
  logger.destroy();
  logger.write = (chunk: unknown) => {
    console.log('Message after logger destroyed', chunk);
    return true;
  };
}
