import winston from 'winston';
import { LOG_FOLDER } from '@/constants/paths';
import RendererTransport from './renderer-transport';
import 'winston-daily-rotate-file';

export * from './wiki-output';

const logger =
  process.env.NODE_ENV === 'test'
    ? Object.assign(console, {
        emerg: console.error.bind(console),
        alert: console.error.bind(console),
        crit: console.error.bind(console),
        warning: console.warn.bind(console),
        notice: console.log.bind(console),
        debug: console.log.bind(console),
      })
    : winston.createLogger({
        levels: {
          emerg: 0,
          alert: 1,
          crit: 2,
          error: 3,
          warning: 4,
          warn: 5,
          notice: 6,
          info: 7,
          debug: 8,
        },
        transports: [
          new winston.transports.Console(),
          new winston.transports.DailyRotateFile({
            filename: 'TiddlyGit-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: false,
            maxSize: '20mb',
            maxFiles: '14d',
            dirname: LOG_FOLDER,
          }),
          new RendererTransport(),
        ],
        exceptionHandlers: [
          new winston.transports.DailyRotateFile({
            filename: 'TiddlyGit-Exception-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: false,
            maxSize: '20mb',
            maxFiles: '14d',
            dirname: LOG_FOLDER,
          }),
        ],
      });
export { logger };
