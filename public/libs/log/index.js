const isDev = require('electron-is-dev');
const path = require('path');

const winston = require('winston');
require('winston-daily-rotate-file');
const RendererTransport = require('./renderer-transport');

const dirname = isDev
  ? path.resolve(__dirname, '..', '..', '..', 'logs')
  : path.resolve(process.resourcesPath, '..', 'logs');

const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'TiddlyGit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxSize: '20mb',
      maxFiles: '14d',
      dirname,
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
      dirname,
    }),
  ],
});
module.exports.logger = logger;
