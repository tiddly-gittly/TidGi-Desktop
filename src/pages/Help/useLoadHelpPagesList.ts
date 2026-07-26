import uniqBy from 'lodash/uniqBy';
import { useEffect, useState } from 'react';
import helpPages from './helpPages.json';

type HelpPageItem = (typeof helpPages.default)[number];

function makeFallbackUrlsArray(
  item: HelpPageItem,
): Omit<HelpPageItem, 'fallbackUrls' | 'language' | 'tags'> & { fallbackUrls: string[]; language: string[]; tags: string[] } {
  return { ...item, fallbackUrls: item.fallbackUrls?.split(' ') ?? [], language: item.language.split(' ') ?? [], tags: item.tags.split(' ') ?? [] };
}

export function useLoadHelpPagesList(language = 'en-GB') {
  const [items, setItems] = useState(helpPages.default.map(makeFallbackUrlsArray));
  useEffect(() => {
    const loadMoreItems = async () => {
      try {
        const responses = await Promise.all(
          helpPages.onlineSources.map(async source => {
            try {
              const data = await fetch(source).then(async response => await (response.json() as Promise<typeof helpPages.default>));
              return data.map(makeFallbackUrlsArray);
            } catch (error) {
              await window.service.native.log('error', `Help page Failed to load online source: ${source}`, { error });
              return [];
            }
          }),
        );
        const newItems = responses.flat();
        setItems(currentItems => uniqBy([...currentItems, ...newItems], 'url'));
      } catch (error) {
        void window.service.native.log('error', 'Failed to load online sources', { function: 'useLoadHelpPagesList.loadMoreItems', error });
      }
    };

    void loadMoreItems();
  }, []);

  return items.filter(item => item.language.includes(language));
}
