import path from 'path';

export function authTokenIsProvided(providedToken: string | undefined): providedToken is string {
  return typeof providedToken === 'string' && providedToken.length > 0;
}

/**
 * Dynamically load the TiddlyWiki module from wiki-local installation if available,
 * otherwise fall back to the built-in version shipped with TidGi.
 * Must be dynamic because static `import { TiddlyWiki } from 'tiddlywiki'`
 * always resolves to the built-in version at module load time.
 */
export async function loadTiddlyWikiModule(TIDDLY_WIKI_BOOT_PATH: string) {
  const tiddlyWikiPackagePath = path.resolve(TIDDLY_WIKI_BOOT_PATH, '..');
  try {
    return await import(tiddlyWikiPackagePath) as typeof import('tiddlywiki');
  } catch {
    return await import('tiddlywiki') as typeof import('tiddlywiki');
  }
}
