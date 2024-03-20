import type { ITiddlyWiki } from 'tiddlywiki';

let wikiInstance: ITiddlyWiki | undefined;

export const getWikiInstance = () => wikiInstance;
export const setWikiInstance = (instance: ITiddlyWiki) => {
  wikiInstance = instance;
};
