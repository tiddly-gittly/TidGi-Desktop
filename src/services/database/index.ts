import type { Database } from 'better-sqlite3';
import settings from 'electron-settings';
import fs from 'fs-extra';
import { injectable } from 'inversify';
import { debounce } from 'lodash';
import path from 'path';
import * as rotateFs from 'rotating-file-stream';
import * as sqliteVec from 'sqlite-vec';
import { DataSource } from 'typeorm';

import { CACHE_DATABASE_FOLDER } from '@/constants/appPaths';
import { isTest } from '@/constants/environment';
import { DEBOUNCE_SAVE_SETTING_BACKUP_FILE, DEBOUNCE_SAVE_SETTING_FILE } from '@/constants/parameters';
import { SQLITE_BINARY_PATH } from '@/constants/paths';
import { logger } from '@services/libs/log';
import { BaseDataSourceOptions } from 'typeorm/data-source/BaseDataSourceOptions.js';
import { ensureSettingFolderExist, fixSettingFileWhenError } from './configSetting';
import type { DatabaseInitOptions, IDatabaseService, ISettingFile } from './interface';
import { AgentDefinitionEntity, AgentInstanceEntity, AgentInstanceMessageEntity } from './schema/agent';
import { AgentBrowserTabEntity } from './schema/agentBrowser';
import { ExternalAPILogEntity } from './schema/externalAPILog';
import { WikiTiddler } from './schema/wiki';
import { WikiEmbeddingEntity, WikiEmbeddingStatusEntity } from './schema/wikiEmbedding';

// Schema config interface
interface SchemaConfig {
  entities: BaseDataSourceOptions['entities'];
  migrations?: BaseDataSourceOptions['migrations'];
  synchronize: boolean;
  migrationsRun: boolean;
}

@injectable()
export class DatabaseService implements IDatabaseService {
  // Database connection pool
  private readonly dataSources = new Map<string, DataSource>();
  // Schema registry, mapping key prefix to schema config
  private readonly schemaRegistry = new Map<string, SchemaConfig>();

  // Settings related fields
  private settingFileContent: ISettingFile | undefined;
  private settingBackupStream: rotateFs.RotatingFileStream | undefined;
  private storeSettingsToFileLock = false;

  async initializeForApp(): Promise<void> {
    logger.info('starting', {
      function: 'DatabaseService.initializeForApp',
    });
    // Initialize settings folder and load settings
    ensureSettingFolderExist();
    this.settingFileContent = settings.getSync() as unknown as ISettingFile;
    logger.info('loaded settings', {
      hasContent: !!this.settingFileContent,
      keys: this.settingFileContent ? Object.keys(this.settingFileContent).length : 0,
      hasPreferences: !!this.settingFileContent?.preferences,
      tidgiMiniWindow: this.settingFileContent?.preferences?.tidgiMiniWindow,
      settingsFilePath: settings.file(),
      function: 'DatabaseService.initializeForApp',
    });

    // Initialize settings backup stream
    try {
      this.settingBackupStream = rotateFs.createStream(`settings.json.bak`, {
        size: '10M',
        interval: '1d',
        maxFiles: 3,
        path: settings.file().replace(/settings\.json$/, ''),
      });
    } catch (error) {
      logger.error('Error initializing setting backup file', { function: 'DatabaseService.initializeForApp', error });
    }

    // Ensure database folder exists
    await fs.ensureDir(CACHE_DATABASE_FOLDER);

    // Register default app database schema
    this.registerSchema('app', {
      entities: [], // Put app-level entities here
      migrations: [], // App-level migrations
      synchronize: false,
      migrationsRun: true,
    });

    // Register wiki database schema example
    this.registerSchema('wiki', {
      entities: [WikiTiddler], // Wiki related entities
      synchronize: true,
      migrationsRun: false,
    });

    // Register wiki-embedding database schema
    this.registerSchema('wikiEmbedding', {
      entities: [WikiEmbeddingEntity, WikiEmbeddingStatusEntity],
      synchronize: true,
      migrationsRun: false,
    });

    // Register agent database schema
    this.registerSchema('agent', {
      entities: [
        AgentDefinitionEntity,
        AgentInstanceEntity,
        AgentInstanceMessageEntity,
        AgentBrowserTabEntity,
      ],
      synchronize: true,
      migrationsRun: false,
    });

    // Register external API log database schema
    this.registerSchema('externalApi', {
      entities: [ExternalAPILogEntity],
      synchronize: true,
      migrationsRun: false,
    });
  }

  /**
   * Register schema config for a specific key prefix
   */
  public registerSchema(keyPrefix: string, config: SchemaConfig): void {
    this.schemaRegistry.set(keyPrefix, config);
    logger.debug(`Schema registered for prefix: ${keyPrefix}`);
  }

  /**
   * Get database file path for a given key
   */
  private getDatabasePathSync(key: string): string {
    // Use in-memory database for unit tests to speed up
    if (process.env.NODE_ENV === 'test' && !process.env.E2E_TEST) {
      return ':memory:';
    }
    return path.resolve(CACHE_DATABASE_FOLDER, `${key}-cache.db`);
  }

  /**
   * Initialize database for a given key
   */
  public async initializeDatabase(key: string, options: DatabaseInitOptions = {}): Promise<void> {
    const databasePath = this.getDatabasePathSync(key);

    // Skip if database already exists (except in test environment where we always use fresh in-memory DB)
    if (!isTest && await fs.exists(databasePath)) {
      logger.debug(`Database already exists for key: ${key} at ${databasePath}`);
      return;
    }

    await fs.ensureDir(CACHE_DATABASE_FOLDER);

    try {
      // Get schema config for the key
      const schemaConfig = this.getSchemaConfigForKey(key);

      // Create and initialize database
      const dataSource = new DataSource({
        type: 'better-sqlite3',
        database: databasePath,
        entities: schemaConfig.entities,
        migrations: schemaConfig.migrations,
        synchronize: schemaConfig.synchronize,
        migrationsRun: schemaConfig.migrationsRun,
        logging: false,
        nativeBinding: SQLITE_BINARY_PATH,
      });

      await dataSource.initialize();

      // Load sqlite-vec extension for embedding databases if enabled
      if (options.enableVectorSearch) {
        try {
          logger.info(`Attempting to load sqlite-vec extension for database key: ${key}`);
          await this.loadSqliteVecExtension(dataSource);
        } catch (error) {
          logger.warn(`sqlite-vec extension failed to load during initialization for key: ${key}, continuing without vector search functionality`, {
            error,
          });
          // Don't throw - allow the database to work without vector functionality
        }
      }

      if (schemaConfig.migrationsRun) {
        await dataSource.runMigrations();
      }

      await dataSource.destroy();
      logger.info(`Database initialized for key: ${key}`);
    } catch (error) {
      logger.error(`Error initializing database for key: ${key}`, { error });
      throw error;
    }
  }

  /**
   * Get database connection for a given key
   */
  public async getDatabase(key: string, options: DatabaseInitOptions = {}, isRetry = false): Promise<DataSource> {
    if (!this.dataSources.has(key)) {
      try {
        const schemaConfig = this.getSchemaConfigForKey(key);

        const dataSource = new DataSource({
          type: 'better-sqlite3',
          database: this.getDatabasePathSync(key),
          entities: schemaConfig.entities,
          migrations: schemaConfig.migrations,
          synchronize: schemaConfig.synchronize,
          migrationsRun: false, // Do not run migrations on connect
          logging: false,
          nativeBinding: SQLITE_BINARY_PATH,
        });

        await dataSource.initialize();

        // Load sqlite-vec extension if vector search is enabled
        if (options.enableVectorSearch) {
          try {
            await this.loadSqliteVecExtension(dataSource);
          } catch (error) {
            logger.warn(`sqlite-vec extension failed to load for key: ${key}, continuing without vector search functionality`, {
              error,
            });
          }
        }

        this.dataSources.set(key, dataSource);
        logger.debug(`Database connection established for key: ${key}`);

        return dataSource;
      } catch (error) {
        logger.error(`Failed to get database for key: ${key}`, { error });

        if (!isRetry) {
          try {
            // Try to fix database lock issue
            await this.fixDatabaseLock(key);
            return await this.getDatabase(key, {}, true);
          } catch (retryError) {
            logger.error(`Failed to retry getting database for key: ${key}`, { error: retryError });
          }
        }

        try {
          await this.dataSources.get(key)?.destroy();
          this.dataSources.delete(key);
        } catch (closeError) {
          logger.error(`Failed to close database in error handler for key: ${key}`, { error: closeError });
        }

        throw error;
      }
    }

    return this.dataSources.get(key)!;
  }

  /**
   * Get database file information like whether it exists and its size in bytes.
   */
  public async getDatabaseInfo(key: string): Promise<{ exists: boolean; size?: number }> {
    const databasePath = this.getDatabasePathSync(key);
    if (databasePath === ':memory:') {
      return { exists: true, size: undefined };
    }

    try {
      const exists = await fs.pathExists(databasePath);
      if (!exists) return { exists: false };
      const stat = await fs.stat(databasePath);
      return { exists: true, size: stat.size };
    } catch (error) {
      logger.error(`getDatabaseInfo failed for key: ${key}`, { error });
      return { exists: false };
    }
  }

  /**
   * Get the database file path for a given key
   */
  public async getDatabasePath(key: string): Promise<string> {
    return this.getDatabasePathSync(key);
  }

  /**
   * Delete the database file for a given key and close any active connection.
   */
  public async deleteDatabase(key: string): Promise<void> {
    try {
      // Close and remove from pool if exists
      if (this.dataSources.has(key)) {
        try {
          await this.dataSources.get(key)?.destroy();
        } catch (error) {
          logger.warn(`Failed to destroy datasource for key: ${key} before deletion`, { error });
        }
        this.dataSources.delete(key);
      }

      const databasePath = this.getDatabasePathSync(key);
      if (databasePath !== ':memory:' && await fs.pathExists(databasePath)) {
        await fs.unlink(databasePath);
        logger.info(`Database file deleted for key: ${key}`);
      }
    } catch (error) {
      logger.error(`deleteDatabase failed for key: ${key}`, { error });
      throw error;
    }
  }

  /**
   * Close database connection for a given key
   */
  public async closeAppDatabase(key: string, drop = false): Promise<void> {
    if (this.dataSources.has(key)) {
      try {
        const dataSource = this.dataSources.get(key)!;
        this.dataSources.delete(key);

        if (drop) {
          await dataSource.dropDatabase();
          await fs.unlink(this.getDatabasePathSync(key));
          logger.info(`Database dropped and file deleted for key: ${key}`);
        } else {
          await dataSource.destroy();
          logger.info(`Database connection closed for key: ${key}`);
        }
      } catch (error) {
        logger.error(`Failed to close database for key: ${key}`, { error });
        throw error;
      }
    }
  }

  /**
   * Get schema config for a given key
   */
  private getSchemaConfigForKey(key: string): SchemaConfig {
    // First, try to find exact match for the key
    if (this.schemaRegistry.has(key)) {
      return this.schemaRegistry.get(key)!;
    }

    // Special handling for wiki databases: extract prefix, e.g. "wiki-123" => "wiki"
    const prefix = key.split('-')[0];
    if (prefix === 'wiki' && this.schemaRegistry.has(prefix)) {
      return this.schemaRegistry.get(prefix)!;
    }

    // If no schema config found, return default config
    logger.warn(`No schema config found for key: ${key}, using default config`);
    return {
      entities: [],
      synchronize: false,
      migrationsRun: false,
    };
  }

  /**
   * Fix database lock issue
   */
  private async fixDatabaseLock(key: string): Promise<void> {
    const databasePath = this.getDatabasePathSync(key);
    const temporaryPath = `${databasePath}.temp`;

    try {
      await fs.copy(databasePath, temporaryPath);
      await fs.unlink(databasePath);
      await fs.copy(temporaryPath, databasePath);
      await fs.unlink(temporaryPath);
      logger.info(`Fixed database lock for key: ${key}`);
    } catch (error) {
      logger.error(`Failed to fix database lock for key: ${key}`, { error });
      throw error;
    }
  }

  // Settings related methods
  public setSetting<K extends keyof ISettingFile>(key: K, value: ISettingFile[K]) {
    if (!this.settingFileContent) {
      logger.error('setSetting called before initializeForApp()');
      return;
    }
    const settingFile = this.settingFileContent;
    settingFile[key] = value;
    void this.debouncedStoreSettingsToFile();
    // Make infrequent backup of setting file, preventing re-install/upgrade from corrupting the file.
    this.debouncedStoreSettingsToBackupFile();
  }

  /**
   * Load sqlite-vec extension for vector operations
   */
  private async loadSqliteVecExtension(dataSource: DataSource): Promise<void> {
    try {
      // Get the underlying better-sqlite3 database instance
      const driver = dataSource.driver as { databaseConnection?: Database };
      const database = driver.databaseConnection;

      if (!database) {
        throw new Error('Could not get underlying SQLite database connection');
      }

      // Load sqlite-vec extension
      logger.debug('Loading sqlite-vec extension...');
      sqliteVec.load(database);

      // Test that sqlite-vec is working
      const result: unknown = await dataSource.query('SELECT vec_version() as version');
      const version = Array.isArray(result) && result.length > 0 && result[0] && typeof result[0] === 'object' && 'version' in result[0]
        ? String((result[0] as { version: unknown }).version)
        : 'unknown';
      logger.info(`sqlite-vec loaded successfully, version: ${version}`);

      // The vec0 virtual tables will be created dynamically by WikiEmbeddingService
      // based on the dimensions needed
    } catch (error) {
      logger.error('Failed to load sqlite-vec extension:', {
        error,
        sqliteVecAvailable: typeof sqliteVec !== 'undefined',
      });
      throw new Error(`sqlite-vec extension failed to load: ${(error as Error).message}`);
    }
  }

  public setSettingImmediately<K extends keyof ISettingFile>(key: K, value: ISettingFile[K]) {
    if (!this.settingFileContent) {
      logger.error('setSettingImmediately called before initializeForApp()');
      return;
    }
    const settingFile = this.settingFileContent;
    settingFile[key] = value;
    void this.debouncedStoreSettingsToFile();
  }

  public getSetting<K extends keyof ISettingFile>(key: K): ISettingFile[K] | undefined {
    if (!this.settingFileContent) {
      logger.error('getSetting called before initializeForApp()', {
        key,
        stack: new Error().stack,
      });
      return undefined;
    }
    const settingFile = this.settingFileContent;
    return settingFile[key];
  }

  private readonly debouncedStoreSettingsToFile = debounce(this.immediatelyStoreSettingsToFile.bind(this), DEBOUNCE_SAVE_SETTING_FILE);
  private readonly debouncedStoreSettingsToBackupFile = debounce(this.immediatelyStoreSettingsToBackupFile.bind(this), DEBOUNCE_SAVE_SETTING_BACKUP_FILE);

  public immediatelyStoreSettingsToBackupFile() {
    if (!this.settingFileContent) return;
    this.settingBackupStream?.write(JSON.stringify(this.settingFileContent) + '\n', 'utf8');
  }

  public async immediatelyStoreSettingsToFile() {
    /* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
    if (!this.settingFileContent) {
      logger.error('immediatelyStoreSettingsToFile called before initializeForApp()');
      return;
    }
    try {
      if (this.storeSettingsToFileLock) return;
      this.storeSettingsToFileLock = true;
      await settings.set(this.settingFileContent as any);
    } catch (error) {
      logger.error('Setting file format bad in debouncedSetSettingFile, will try force writing', { error, settingFileContent: JSON.stringify(this.settingFileContent) });
      ensureSettingFolderExist();
      fixSettingFileWhenError(error as Error);
      fs.writeJSONSync(settings.file(), this.settingFileContent);
    } finally {
      this.storeSettingsToFileLock = false;
    }
  }
}
