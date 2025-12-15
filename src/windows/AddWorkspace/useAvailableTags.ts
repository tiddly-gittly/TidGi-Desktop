import { WikiChannel } from '@/constants/channels';
import { useEffect, useState } from 'react';

/**
 * Fetch all tags from a wiki for autocomplete suggestions
 * @param workspaceID The workspace ID to fetch tags from
 * @param enabled Whether to fetch tags (e.g., only for sub-wikis)
 * @returns Array of available tag names
 */
export function useAvailableTags(workspaceID: string | undefined, enabled: boolean): string[] {
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    if (enabled && workspaceID) {
      void (async () => {
        try {
          const tags = await window.service.wiki.wikiOperationInServer(
            WikiChannel.runFilter,
            workspaceID,
            ['[all[tags]!is[system]]'],
          );
          if (Array.isArray(tags)) {
            setAvailableTags(tags);
          }
        } catch {
          // If wiki is not running or error occurs, just use empty array
          setAvailableTags([]);
        }
      })();
    } else {
      setAvailableTags([]);
    }
  }, [enabled, workspaceID]);

  return availableTags;
}
