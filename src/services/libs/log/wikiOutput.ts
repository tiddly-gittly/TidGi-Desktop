import { LOG_FOLDER } from '@/constants/appPaths';
import winston, { format } from 'winston';
import 'winston-daily-rotate-file';
import { levels } from '@/constants/logger';

function getWikiLogFileName(workspaceID: string, wikiName: string): string {
  const logFileName = wikiName.replaceAll(/["*/:<>?\\|]/g, '_');
  return `${workspaceID}-${logFileName}`;
}
export function getWikiErrorLogFileName(workspaceID: string, wikiName: string): string {
  return `error-${getWikiLogFileName(workspaceID, wikiName)}`;
}

const wikiLoggers: Record<string, winston.Logger> = {};

/**
 * Create log file using winston
 * @param {string} wikiName
 */
export function startWikiLogger(workspaceID: string, wikiName: string) {
  if (getWikiLogger(workspaceID) !== undefined) {
    stopWikiLogger(workspaceID);
  }
  const wikiLogger = (
    process.env.NODE_ENV === 'test'
      ? Object.assign(console, {
        emerg: console.error.bind(console),
        alert: console.error.bind(console),
        crit: console.error.bind(console),
        warning: console.warn.bind(console),
        notice: console.log.bind(console),
        debug: console.log.bind(console),
        close: () => {},
      })
      : winston.createLogger({
        levels,
        transports: [
          new winston.transports.Console(),
          new winston.transports.DailyRotateFile({
            filename: `${getWikiLogFileName(workspaceID, wikiName)}-%DATE%.log`,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: false,
            maxSize: '20mb',
            maxFiles: '14d',
            dirname: LOG_FOLDER,
            level: 'debug',
          }),
        ],
        exceptionHandlers: [
          new winston.transports.DailyRotateFile({
            filename: `${getWikiErrorLogFileName(workspaceID, wikiName)}-%DATE%.log`,
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
  wikiLoggers[workspaceID] = wikiLogger;
  return wikiLogger;
}

export function getWikiLogger(workspaceID: string): winston.Logger {
  return wikiLoggers[workspaceID];
}

export function stopWikiLogger(workspaceID: string) {
  wikiLoggers[workspaceID].close();
  try {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete wikiLoggers[workspaceID];
  } catch {}
}
