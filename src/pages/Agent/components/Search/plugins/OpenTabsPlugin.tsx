import { AutocompletePlugin } from '@algolia/autocomplete-js';
import { useTabStore } from '../../../store/tabStore';
import { TabState, TabType } from '../../../types/tab';

type TabSource = {
  id: string;
  title: string;
  type: TabType;
  favicon?: string;
};

export const createOpenTabsPlugin = (): AutocompletePlugin<TabSource, unknown> => {
  const plugin = {
    getSources({ query }) {
      return [
        {
          sourceId: 'openTabsSource',
          getItems() {
            const { tabs } = useTabStore.getState();
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
                  <div className='aa-SourceHeaderTitle'>打开的标签页</div>
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
                  <div className='aa-ItemContent'>没有找到标签页</div>
                </div>
              );
            },
          },
          onSelect({ item }) {
            const { setActiveTab } = useTabStore.getState();
            setActiveTab(item.id);
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
