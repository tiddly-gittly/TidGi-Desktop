import { AutocompletePlugin } from '@algolia/autocomplete-js';
import { getI18n } from 'react-i18next';

import { useTabStore } from '../../../store/tabStore';
import { TabState, TabType } from '../../../types/tab';

type TabSource = {
  id: string;
  title: string;
  type: TabType;
  favicon?: string;
};

export const createOpenTabsPlugin = (): AutocompletePlugin<TabSource, unknown> => {
  const { t } = getI18n();
  const plugin = {
    getSources({ query }) {
      return [
        {
          sourceId: 'openTabsSource',
          getItems() {
            const { tabs } = useTabStore.getState();
            // Filter out error tabs and those without titles
            const openTabs = tabs.filter(
              (tab) => tab.state !== TabState.ERROR && tab.title,
            );

            if (!query) {
              return openTabs.map((tab) => ({
                id: tab.id,
                title: tab.title,
                type: tab.type,
                favicon: (tab as { favicon?: string }).favicon,
              }));
            }

            // Filter tabs by the search query
            const lowerCaseQuery = query.toLowerCase();
            return openTabs
              .filter((tab) => tab.title.toLowerCase().includes(lowerCaseQuery))
              .map((tab) => ({
                id: tab.id,
                title: tab.title,
                type: tab.type,
                favicon: (tab as { favicon?: string }).favicon,
              }));
          },
          templates: {
            header() {
              return (
                <div className='aa-SourceHeader'>
                  <div className='aa-SourceHeaderTitle'>{t('Search.OpenTabs', { ns: 'agent' })}</div>
                </div>
              );
            },
            item({ item, state }) {
              return (
                <div className='aa-ItemWrapper'>
                  <div className='aa-ItemContent'>
                    <div className='aa-ItemIcon'>
                      {item.favicon
                        ? (
                          <div
                            className='aa-ItemFavicon'
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '4px',
                              backgroundColor: '#f0f0f0',
                            }}
                          >
                            {item.favicon}
                          </div>
                        )
                        : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '4px',
                              backgroundColor: '#f0f0f0',
                            }}
                          >
                            {getTabTypeIcon(item.type)}
                          </div>
                        )}
                    </div>
                    <div className='aa-ItemContentBody'>
                      <div className='aa-ItemContentTitle'>
                        <span
                          dangerouslySetInnerHTML={{
                            __html: highlightHits({
                              hit: item,
                              attribute: 'title',
                              query: state.query,
                            }),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            },
            noResults() {
              return (
                <div className='aa-ItemWrapper'>
                  <div className='aa-ItemContent'>{t('Search.NoTabsFound', { ns: 'agent' })}</div>
                </div>
              );
            },
          },
          onSelect: async ({ item, state, navigator }) => {
            try {
              // Pass sourceId in context to help navigator identify source type
              navigator.navigate({
                item,
                itemUrl: item.title,
                state: {
                  ...state,
                  context: {
                    ...state.context,
                    sourceId: 'openTabsSource',
                  },
                },
              });
            } catch (error) {
              console.error('Failed to select tab in search:', error);
            }
          },
        },
      ];
    },
  } satisfies AutocompletePlugin<TabSource, unknown>;

  return plugin;
};

function getTabTypeIcon(type: TabType): string {
  switch (type) {
    case TabType.CHAT:
      return '💬';
    case TabType.WEB:
      return '🌐';
    case TabType.NEW_TAB:
      return '➕';
    default:
      return '📄';
  }
}

function highlightHits({
  hit,
  attribute,
  query,
}: {
  hit: { [key: string]: string };
  attribute: string;
  query: string;
}): string {
  const value = hit[attribute] || '';
  if (!query) return value;

  const lowerCaseValue = value.toLowerCase();
  const lowerCaseQuery = query.toLowerCase();
  const startIndex = lowerCaseValue.indexOf(lowerCaseQuery);

  if (startIndex === -1) return value;

  const endIndex = startIndex + lowerCaseQuery.length;

  return (
    value.substring(0, startIndex) +
    `<mark>${value.substring(startIndex, endIndex)}</mark>` +
    value.substring(endIndex)
  );
}
