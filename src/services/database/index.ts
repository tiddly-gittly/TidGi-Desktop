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
import { DataSource } from 'typeorm';
import { loadSqliteVss } from './sqlite-vss';

@injectable()
export class DatabaseService implements IDatabaseService {
  @lazyInject(serviceIdentifier.NativeService)
  private readonly nativeService!: INativeService;

  // tiddlywiki require methods to be sync, so direct run them in the main process. But later we can use worker_thread to run heavier search queries, as a readonly slave db, and do some data sync between them.
  // many operations has to be done in wikiWorker, so can be accessed by nodejs wiki in a sync way.
  // private readonly dbWorker?: ModuleThread<GitWorker>;

  async initializeForWorkspace(workspaceID: string): Promise<void> {
    const destinationFilePath = this.getWorkspaceDataBasePath(workspaceID);
    // only create db file for this workspace's wiki if it doesn't exist
    if (await fs.exists(this.getWorkspaceDataBasePath(workspaceID))) {
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

  async initializeForApp(): Promise<void> {
    const destinationFilePath = this.getAppDataBasePath();
    // only create db file for app if it doesn't exist
    if (await fs.exists(destinationFilePath)) {
      logger.debug(`DatabaseService.initializeForApp skip, there already has sqlite database for app in ${destinationFilePath}`);
      return;
    }
    await fs.ensureDir(CACHE_DATABASE_FOLDER);

    try {
      logger.debug(`DatabaseService.initializeForApp create a sqlite database for app`, { SQLITE_BINARY_PATH });

      // Initialize TypeORM Connection using DataSource
      const appDataSource = new DataSource({
        type: 'better-sqlite3',
        nativeBinding: SQLITE_BINARY_PATH,
        database: destinationFilePath,
        // entities,
        synchronize: false,
        migrationsRun: true,
        logging: true,
        // migrations,
      });

      await appDataSource.initialize();
      await appDataSource.runMigrations();
      await appDataSource.destroy();
      logger.info(`DatabaseService.initializeForApp TypeORM connection initialized and migrations ran for app`);
    } catch (error) {
      logger.error(`DatabaseService.initializeForApp error when initializing TypeORM connection and running migrations for app: ${(error as Error).message}`);
    }
  }

  private readonly dataSources = new Map<string, DataSource>();

  async getAppDatabase(isRetry = false): Promise<DataSource> {
    const name = 'app-tidgi';
    if (!this.dataSources.has(name)) {
      try {
        const dataSource = new DataSource({
          type: 'sqlite',
          database: this.getAppDataBasePath(),
          // entities,
          synchronize: false,
          migrationsRun: false,
          logging: true,
          // migrations,
        });
        /**
         * Error `TypeError: Cannot read property 'transaction' of undefined` will show if run any query without initialize.
         */
        await dataSource.initialize();

        this.dataSources.set(name, dataSource);
        return dataSource;
      } catch (error) {
        console.error(`Failed to getDatabase ${name}: ${(error as Error).message} ${(error as Error).stack ?? ''}`);
        if (!isRetry) {
          try {
            await this.#fixAppDbLock();
            return await this.getAppDatabase(true);
          } catch (error) {
            console.error(`Failed to retry getDatabase ${name}: ${(error as Error).message} ${(error as Error).stack ?? ''}`);
          }
        }
        try {
          await this.dataSources.get(name)?.destroy();
        } catch (error) {
          console.error(`Failed to destroy in getDatabase ${name}: ${(error as Error).message} ${(error as Error).stack ?? ''}`);
        }
        throw error;
      }
    }

    return this.dataSources.get(name)!;
  }

  async closeAppDatabase(drop?: boolean) {
    const name = 'app-tidgi';
    if (this.dataSources.has(name)) {
      try {
        const dataSource = this.dataSources.get(name)!;
        this.dataSources.delete(name);
        if (drop === true) {
          await dataSource.dropDatabase();
          // need to delete the file. May encounter SQLITE_BUSY error if not deleted.
          await fs.unlink(this.getAppDataBasePath());
        } else {
          await dataSource.destroy();
          console.log(`closeDatabase ${name}`);
        }
      } catch (error) {
        console.error(`Failed to closeDatabase ${name}: ${(error as Error).message} ${(error as Error).stack ?? ''}`);
        throw error;
      }
    }
  }

  /**
   * Fix SQLite busy by move the file.
   * @url https://stackoverflow.com/a/1226850
   *
   * Fixes this:
   *
   * ```error
   * [Error: Error getting skinny tiddlers list from SQLite: Call to function 'ExpoSQLite.exec' has been rejected.
   *  → Caused by: android.database.sqlite.SQLiteDatabaseLockedException: database is locked (code 5 SQLITE_BUSY): , while compiling: PRAGMA journal_mode] Error: Error getting skinny tiddlers list from SQLite: Call to function 'ExpoSQLite.exec' has been rejected.
   *  → Caused by: android.database.sqlite.SQLiteDatabaseLockedException: database is locked (code 5 SQLITE_BUSY): , while compiling: PRAGMA journal_mode
   * ```
   */
  async #fixAppDbLock() {
    const oldSqlitePath = this.getAppDataBasePath();
    const temporarySqlitePath = `${oldSqlitePath}.temp`;
    await fs.copy(oldSqlitePath, temporarySqlitePath);
    await fs.unlink(oldSqlitePath);
    await fs.copy(temporarySqlitePath, oldSqlitePath);
    await fs.unlink(temporarySqlitePath);
  }

  getWorkspaceDataBasePath(workspaceID: string): string {
    return path.resolve(CACHE_DATABASE_FOLDER, `${workspaceID}-sqlite3-cache.db`);
  }

  getAppDataBasePath(): string {
    return path.resolve(CACHE_DATABASE_FOLDER, `app-tidgi-sqlite3-cache.db`);
  }
}
