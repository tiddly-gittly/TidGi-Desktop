import { AutocompletePlugin } from '@algolia/autocomplete-js';
import { getI18n } from 'react-i18next';

import { useTabStore } from '../../../store/tabStore';
import { TabType } from '../../../types/tab';
import { getTabTypeIcon, highlightHits } from '../styles';

type TabSource = {
  id: string;
  title: string;
  type: TabType;
  favicon?: string;
};

export const createClosedTabsPlugin = (): AutocompletePlugin<TabSource, unknown> => {
  const { t } = getI18n();
  const plugin = {
    getSources({ query }) {
      return [
        {
          sourceId: 'closedTabsSource',
          getItems() {
            const { closedTabs } = useTabStore.getState();

            if (!query) {
              return closedTabs.map((tab) => ({
                id: tab.id,
                title: tab.title,
                type: tab.type,
                favicon: (tab as { favicon?: string }).favicon,
              }));
            }

            const lowerCaseQuery = query.toLowerCase();
            return closedTabs
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
                  <div className='aa-SourceHeaderTitle'>{t('Search.RecentlyClosedTabs', { ns: 'agent' })}</div>
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
                  <div className='aa-ItemContent'>{t('Search.NoClosedTabsFound', { ns: 'agent' })}</div>
                </div>
              );
            },
          },
          onSelect: async ({ item: _item }) => {
            try {
              const tabStore = useTabStore.getState();
              const { activeTabId, tabs } = tabStore;

              // Handle current active tab
              if (activeTabId) {
                const activeTab = tabs.find(tab => tab.id === activeTabId);
                // Always close NEW_TAB type tabs when selecting from search
                if (activeTab && activeTab.type === TabType.NEW_TAB) {
                  // await is needed because closeTab returns a Promise
                  await window.service.agentBrowser.closeTab(activeTabId);
                }
              }

              // Restore recently closed tab using the service directly
              const restoredTab = await window.service.agentBrowser.restoreClosedTab();

              // For tabs restored via the API, the tab is already added to the store
              // Just activate the tab if it was successfully restored
              if (restoredTab && restoredTab.id) {
                // Let the tabStore handle this instead of directly calling the service
                void tabStore.initialize();
              }
            } catch (error) {
              console.error('Failed to restore closed tab from search:', error);
            }
          },
        },
      ];
    },
  } satisfies AutocompletePlugin<TabSource, unknown>;

  return plugin;
};
