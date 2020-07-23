const winston = require('winston');
require('winston-daily-rotate-file');

const { LOG_FOLDER } = require('../../constants/paths');
const RendererTransport = require('./renderer-transport');

const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
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
module.exports.logger = logger;
