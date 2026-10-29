import type { ITiddlyWiki, Syncer } from 'tiddlywiki';

/**
 * The core syncer advances changeCount only after the filesystem adaptor's
 * successful callback. Waiting here preserves its ordering and retry behavior.
 */
export async function waitForTiddlerPersistence(wikiInstance: ITiddlyWiki, title: string, revision: number, deadline: number): Promise<'saved' | 'excluded'> {
  const syncer = wikiInstance.syncer as
    | (Syncer & {
      tiddlerInfo: Record<string, { changeCount: number } | undefined>;
    })
    | undefined;
  if (!syncer) throw new Error('Filesystem syncer is unavailable; tiddler has not been saved to disk');
  // The server's configured save filter intentionally makes some titles
  // volatile. Acknowledge that policy explicitly instead of retrying forever
  // and starving unrelated persistent titles in the core's single task slot.
  if (!syncer.getSyncedTiddlers().includes(title)) return 'excluded';
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Tiddler was not saved to disk before the save request expired');
    if (!wikiInstance.wiki.tiddlerExists(title) || wikiInstance.wiki.getChangeCount(title) !== revision) {
      throw new Error('Tiddler changed while saving; the previous revision was not acknowledged');
    }
    if (syncer.tiddlerInfo[title]?.changeCount === revision) return 'saved';
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(25, remaining)));
  }
}

export async function waitForTiddlerDeletion(wikiInstance: ITiddlyWiki, title: string, revision: number, deadline: number): Promise<void> {
  const syncer = wikiInstance.syncer as
    | (Syncer & {
      tiddlerInfo: Record<string, { changeCount: number } | undefined>;
      numTasksInProgress: number;
    })
    | undefined;
  if (!syncer) throw new Error('Filesystem syncer is unavailable; deletion has not been saved to disk');
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Deletion was not saved to disk before the request expired');
    if (wikiInstance.wiki.tiddlerExists(title) || wikiInstance.wiki.getChangeCount(title) !== revision) {
      throw new Error('Tiddler changed while deleting; deletion was not acknowledged');
    }
    // A new title's first save may still be writing before tiddlerInfo exists.
    // Wait for that task (and the core's subsequent delete) as well.
    if (!syncer.tiddlerInfo[title] && syncer.numTasksInProgress === 0) return;
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(25, remaining)));
  }
}
