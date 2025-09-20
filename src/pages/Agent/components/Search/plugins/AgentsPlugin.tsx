import { AutocompletePlugin } from '@algolia/autocomplete-js';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { getI18n } from 'react-i18next';

import { TEMP_TAB_ID_PREFIX } from '../../../constants/tab';
import { useTabStore } from '../../../store/tabStore';
import { TabType } from '../../../types/tab';

interface AgentsPluginOptions {
  onSelect?: (agent: AgentDefinition) => void;
  sourceTitle?: string;
}

export const createAgentsPlugin = (options: AgentsPluginOptions = {}): AutocompletePlugin<AgentDefinition & Record<string, unknown>, unknown> => {
  // Get translation function, but fallback gracefully in test environment
  let t: (key: string) => string;
  try {
    t = getI18n().t;
  } catch {
    // Fallback for test environment
    t = (key: string) => key;
  }
  const plugin = {
    getSources({ query }) {
      return [
        {
          sourceId: options.onSelect ? 'templateAgentsSource' : 'agentsSource',
          getItems: async () => {
            try { // Get agents list using window.service.agent.getAgents
              const agents = await window.service.agentDefinition.getAgentDefs();
              if (!query) {
                return agents as (AgentDefinition & Record<string, unknown>)[];
              }

              const lowerCaseQuery = query.toLowerCase();
              return agents.filter(agent =>
                (agent.name && agent.name.toLowerCase().includes(lowerCaseQuery)) ||
                (agent.description && agent.description.toLowerCase().includes(lowerCaseQuery))
              ) as (AgentDefinition & Record<string, unknown>)[];
            } catch (error) {
              console.error(t('Search.FailedToFetchAgents'), error);
              return [];
            }
          },
          templates: {
            header() {
              return (
                <div className='aa-SourceHeader'>
                  <div className='aa-SourceHeaderTitle'>{options.sourceTitle || t('Search.AvailableAgents')}</div>
                </div>
              );
            },
            item({ item, state }) {
              return (
                <div className='aa-ItemWrapper'>
                  <div className='aa-ItemContent'>
                    <div className='aa-ItemIcon'>
                      {item.avatarUrl
                        ? (
                          <img
                            src={item.avatarUrl}
                            alt={item.name}
                            width='24'
                            height='24'
                            style={{ borderRadius: '4px' }}
                          />
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
                            🤖
                          </div>
                        )}
                    </div>
                    <div className='aa-ItemContentBody'>
                      <div className='aa-ItemContentTitle'>
                        <span
                          dangerouslySetInnerHTML={{
                            __html: highlightHits({
                              hit: item,
                              attribute: 'name',
                              query: state.query,
                            }),
                          }}
                        />
                      </div>
                      {item.description && (
                        <div className='aa-ItemContentDescription'>
                          <span
                            dangerouslySetInnerHTML={{
                              __html: highlightHits({
                                hit: item,
                                attribute: 'description',
                                query: state.query,
                              }),
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            },
            noResults() {
              return (
                <div className='aa-ItemWrapper'>
                  <div className='aa-ItemContent'>{t('Search.NoAgentsFound')}</div>
                </div>
              );
            },
          },
          onSelect: async ({ item }) => {
            try {
              // If custom onSelect callback is provided, use it
              if (options.onSelect) {
                options.onSelect(item as AgentDefinition);
                return;
              }

              // Default behavior: create chat tab
              const tabStore = useTabStore.getState();
              const { addTab, closeTab, activeTabId, tabs } = tabStore;

              // Handle current active tab - close temp tabs or NEW_TAB type tabs
              if (activeTabId) {
                const activeTab = tabs.find(tab => tab.id === activeTabId);
                if (activeTab && (activeTab.id.startsWith(TEMP_TAB_ID_PREFIX) || activeTab.type === TabType.NEW_TAB)) {
                  closeTab(activeTabId);
                }
              }

              // Create new chat tab directly using addTab
              await addTab(TabType.CHAT, {
                agentDefId: item.id,
              });
            } catch (error) {
              console.error(t('Search.FailedToCreateChatWithAgent'), error);
            }
          },
        },
      ];
    },
  } satisfies AutocompletePlugin<AgentDefinition & Record<string, unknown>, unknown>;

  return plugin;
};

function highlightHits({
  hit,
  attribute,
  query,
}: {
  hit: AgentDefinition & Record<string, unknown>;
  attribute: string;
  query: string;
}): string {
  // Get attribute value and convert to string
  const attributeValue = hit[attribute];
  let value = '';

  if (typeof attributeValue === 'string') {
    value = attributeValue;
  } else if (attributeValue === null || attributeValue === undefined) {
    // Handle empty value
  } else {
    // Try to safely convert to string
    try {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const stringValue = String(attributeValue);
      if (stringValue !== '[object Object]') {
        value = stringValue;
      } else {
        value = JSON.stringify(attributeValue);
      }
    } catch {
      // Conversion failed, keep empty string
    }
  }

  // If no query or value is empty, return value directly
  if (!query || !value) return value;

  // Perform search and highlighting
  const lowerCaseValue = value.toLowerCase();
  const lowerCaseQuery = query.toLowerCase();
  const startIndex = lowerCaseValue.indexOf(lowerCaseQuery);

  if (startIndex === -1) return value;

  const endIndex = startIndex + lowerCaseQuery.length;

  return value.substring(0, startIndex) +
    `<mark>${value.substring(startIndex, endIndex)}</mark>` +
    value.substring(endIndex);
}
