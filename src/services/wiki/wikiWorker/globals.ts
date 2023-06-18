import { WikiWorkerDatabaseOperations } from '@services/database/wikiWorkerOperations';
import type { ITiddlyWiki } from 'tiddlywiki';

let wikiInstance: ITiddlyWiki | undefined;
let cacheDatabase: WikiWorkerDatabaseOperations | undefined;

export const getWikiInstance = () => wikiInstance;
export const getCacheDatabase = () => cacheDatabase;
export const setWikiInstance = (instance: ITiddlyWiki) => {
  wikiInstance = instance;
};
export const setCacheDatabase = (database: WikiWorkerDatabaseOperations) => {
  cacheDatabase = database;
};
