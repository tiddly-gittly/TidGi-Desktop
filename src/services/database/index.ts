import Sqlite3Database from 'better-sqlite3';
import { injectable } from 'inversify';

import type { INativeService } from '@services/native/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IDatabaseService } from './interface';

import { CACHE_DATABASE_FOLDER } from '@/constants/appPaths';
import { PACKAGE_PATH_BASE, SQLITE_BINARY_PATH } from '@/constants/paths';
import { lazyInject } from '@services/container';
import { logger } from '@services/libs/log';
import fs from 'fs-extra';
import path from 'path';
import { loadSqliteVss } from './sqlite-vss';

@injectable()
export class DatabaseService implements IDatabaseService {
  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  // tiddlywiki require methods to be sync, so direct run them in the main process. But later we can use worker_thread to run heavier search queries, as a readonly slave db, and do some data sync between them.
  // many operations has to be done in wikiWorker, so can be accessed by nodejs wiki in a sync way.
  // private readonly dbWorker?: ModuleThread<GitWorker>;

  async initializeForWorkspace(workspaceID: string): Promise<void> {
    const destinationFilePath = this.getDataBasePath(workspaceID);
    // only create db file for this workspace's wiki if it doesn't exist
    if (await fs.exists(this.getDataBasePath(workspaceID))) {
      logger.debug(`DatabaseService.initializeForWorkspace skip, there already has sqlite database for workspace ${workspaceID} in ${destinationFilePath}`);
      return;
    }
    await fs.ensureDir(CACHE_DATABASE_FOLDER);
    try {
      // create a database and table that adapts tiddlywiki usage
      logger.debug(`DatabaseService.initializeForWorkspace create a sqlite database for workspace`, { SQLITE_BINARY_PATH, workspaceID });
      let database: Sqlite3Database.Database;
      try {
        database = new Sqlite3Database(':memory:', { verbose: logger.debug, nativeBinding: SQLITE_BINARY_PATH });
      } catch (error) {
        logger.error(`error when loading sqlite3 for workspace ${workspaceID}, skip because of error to prevent crash: ${(error as Error).message}`);
        return;
      }
      try {
        logger.debug(`DatabaseService.initializeForWorkspace load vss for sqlite database`, { PACKAGE_PATH_BASE, workspaceID });
        loadSqliteVss(database, PACKAGE_PATH_BASE);
        const vssVersion = database.prepare('select vss_version()').pluck().get() as string;
        logger.debug(`DatabaseService.initializeForWorkspace successfully using sqlite-vss version: ${vssVersion} for workspace ${workspaceID}`);
      } catch (error) {
        logger.error(`error when loading sqlite-vss for workspace ${workspaceID}: ${(error as Error).message}`);
      }
      logger.debug(`DatabaseService.initializeForWorkspace create a table that adapts tiddlywiki usage for workspace`, { workspaceID });
      /**
       * Create table storing most commonly used tiddler fields, other fields are stored in `fields` column as a JSON string.
       */
      const createTiddlywikiTable = database.prepare(`
        CREATE TABLE IF NOT EXISTS tiddlers (
          title TEXT PRIMARY KEY,
          text TEXT,
          type TEXT,
          created INTEGER,
          modified INTEGER,
          tags TEXT,
          fields TEXT,
          creator TEXT,
          modifier TEXT
          );
      `);
      logger.debug(`DatabaseService.initializeForWorkspace table is created, start backup and close`, { workspaceID });
      createTiddlywikiTable.run();
      await database.backup(destinationFilePath);
      database.close();
    } catch (error) {
      logger.error(`DatabaseService.initializeForWorkspace error when creating sqlite cache database for workspace: ${(error as Error).message}`, { workspaceID });
    }
  }

  getDataBasePath(workspaceID: string): string {
    return path.resolve(CACHE_DATABASE_FOLDER, `${workspaceID}-sqlite3-cache.db`);
  }
}
