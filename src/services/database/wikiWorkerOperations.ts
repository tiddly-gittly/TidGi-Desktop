import type { ITiddlerFields } from '@tiddlygit/tiddlywiki';
import Sqlite3Database from 'better-sqlite3';
import fs from 'fs-extra';
import { loadSqliteVss } from './sqlite-vss';

export interface ISqliteDatabasePaths {
  databaseFile: string;
  packagePathBase: string;
  sqliteBinary: string;
}
export class WikiWorkerDatabaseOperations {
  public database: Sqlite3Database.Database;
  constructor(paths: ISqliteDatabasePaths) {
    if (!fs.existsSync(paths.databaseFile)) {
      throw new SqliteDatabaseNotInitializedError(paths.databaseFile);
    }
    const database = new Sqlite3Database(paths.databaseFile, { verbose: console.log, fileMustExist: true, nativeBinding: paths.sqliteBinary });
    this.database = database;
    this.prepareMethods();
    this.loadVSS(database, paths);
  }

  loadVSS(database: Sqlite3Database.Database, paths: ISqliteDatabasePaths) {
    try {
      loadSqliteVss(database, paths.packagePathBase);
    } catch {
      // ignore, error already logged in src/services/database/index.ts 's `initializeForWorkspace`
    }
  }

  insertTiddlers!: Sqlite3Database.Transaction<(tiddlers: ITiddlerFields[]) => void>;
  putTiddlers(tiddlers: ITiddlerFields[]) {
    this.insertTiddlers(tiddlers);
  }

  private prepareMethods() {
    const insertTiddler = this.database.prepare(`
      INSERT INTO tiddlers (title, text, type, created, modified, tags, fields, creator, modifier)
      VALUES (@title, @text, @type, @created, @modified, @tags, @fields, @creator, @modifier)
      ON CONFLICT(title) DO UPDATE SET
        text = excluded.text,
        type = excluded.type,
        created = excluded.created,
        modified = excluded.modified,
        tags = excluded.tags,
        fields = excluded.fields,
        creator = excluded.creator,
        modifier = excluded.modifier
    `);
    this.insertTiddlers = this.database.transaction((tiddlers: ITiddlerFields[]) => {
      for (const tiddler of tiddlers) {
        insertTiddler.run(tiddler);
      }
    });
  }
}

export class SqliteDatabaseNotInitializedError extends Error {
  constructor(databaseFile: string) {
    super();
    this.message = `database file not found (This is OK for first init of workspace, until initializeWorkspaceView call initializeForWorkspace): ${databaseFile}`;
  }
}
