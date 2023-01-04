/**
 * Sync tidgi app state <-> wiki state
 */

import { WikiChannel } from '@/constants/channels';
import { WikiStateKey } from '@/constants/wiki';
import { preference } from './common/services';
import { wikiOperations } from './wikiOperation';

export async function syncTidgiStateWhenWikiLoads(): Promise<void> {
  /**
   * Tell wiki titleBar is on/off, so opened-tiddlers-bar plugin can react to it.
   */
  const [titleBar, sidebar] = await Promise.all([preference.get('titleBar'), preference.get('sidebar')]);
  await Promise.all([
    wikiOperations[WikiChannel.setState](WikiStateKey.titleBarOpened, titleBar ? 'yes' : 'no'),
    wikiOperations[WikiChannel.setState](WikiStateKey.sideBarOpened, sidebar ? 'yes' : 'no'),
  ]);
  // listen on changes that needs immediate update
  window.observables.preference.preference$.subscribe({
    next: async ({ sidebar }) => {
      await wikiOperations[WikiChannel.setState](WikiStateKey.sideBarOpened, sidebar ? 'yes' : 'no');
    },
  });
}
