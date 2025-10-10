import { AutocompletePlugin } from '@algolia/autocomplete-js';
import { getI18n } from 'react-i18next';

import { TEMP_TAB_ID_PREFIX } from '../../../constants/tab';
import { useTabStore } from '../../../store/tabStore';
import { TabState, TabType } from '../../../types/tab';
import { getTabTypeIcon, highlightHits } from '../styles';

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
          onSelect: async ({ item }) => {
            try {
              const tabStore = useTabStore.getState();
              const { activeTabId, tabs } = tabStore;

              // Handle current active tab
              if (activeTabId) {
                const activeTab = tabs.find(tab => tab.id === activeTabId);
                // Always close temp tabs or NEW_TAB type tabs when selecting from search
                if (activeTab && (activeTab.id.startsWith(TEMP_TAB_ID_PREFIX) || activeTab.type === TabType.NEW_TAB)) {
                  // Use tabStore method instead of direct service call
                  tabStore.closeTab(activeTabId);
                }
              }

              // Use the tabStore's setActiveTab method which will handle the backend service call
              // and update the store state at the same time
              tabStore.setActiveTab(item.id);
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
