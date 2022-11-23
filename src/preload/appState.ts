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
  const titleBar = await preference.get('titleBar');
  await wikiOperations[WikiChannel.setState](WikiStateKey.titleBarOpened, titleBar ? 'yes' : 'no');
}
