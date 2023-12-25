/* eslint-disable unicorn/no-array-callback-reference */
import uniqBy from 'lodash/uniqBy';
import { useEffect, useState } from 'react';
import { LastArrayElement } from 'type-fest';
import helpPages from './helpPages.json';

function makeFallbackUrlsArray(item: LastArrayElement<typeof helpPages.default>): Omit<LastArrayElement<typeof helpPages.default>, 'fallbackUrls'> & { fallbackUrls: string[] } {
  return { ...item, fallbackUrls: item?.fallbackUrls?.split(' ') ?? [] };
}

export function useLoadHelpPagesList() {
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
              await window.service.native.log('error', `Help page Failed to load online source: ${source} ${(error as Error).message}`);
              return [];
            }
          }),
        );
        const newItems = responses.flat();
        setItems(currentItems => uniqBy([...currentItems, ...newItems], 'url'));
      } catch (error) {
        console.error('Failed to load online sources:', error);
      }
    };

    void loadMoreItems();
  }, []);

  return items;
}
