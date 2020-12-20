import winston from 'winston';
require('winston-daily-rotate-file');

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'LOG_FOLDER... Remove this comment to see the full error message
import { LOG_FOLDER } from '../../constants/paths';
import RendererTransport from './renderer-transport';

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'logger'.
const logger = winston.createLogger({
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
