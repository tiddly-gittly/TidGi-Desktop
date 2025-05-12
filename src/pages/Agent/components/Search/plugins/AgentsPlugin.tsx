import { AutocompletePlugin } from '@algolia/autocomplete-js';
import type { AgentDefinition } from '@services/agentDefinition/interface';
import { getI18n } from 'react-i18next';
import { useTabStore } from '../../../store/tabStore';
import { TabType } from '../../../types/tab';

export const createAgentsPlugin = (): AutocompletePlugin<AgentDefinition & Record<string, unknown>, unknown> => {
  const { t } = getI18n();
  const plugin = {
    getSources({ query }) {
      return [
        {
          sourceId: 'agentsSource',
          getItems: async () => {
            try { // Get agents list using window.service.agent.getAgents
              const agents = await window.service.agentDefinition.getAgentDefs();
              if (!query) {
                return agents as (AgentDefinition & Record<string, unknown>)[];
              }

              const lowerCaseQuery = query.toLowerCase();
              return agents.filter(agent =>
                agent.name.toLowerCase().includes(lowerCaseQuery) ||
                (agent.description && agent.description.toLowerCase().includes(lowerCaseQuery))
              ) as (AgentDefinition & Record<string, unknown>)[];
            } catch (error) {
              console.error(t('Search.FailedToFetchAgents', { ns: 'agent' }), error);
              return [];
            }
          },
          templates: {
            header() {
              return (
                <div className='aa-SourceHeader'>
                  <div className='aa-SourceHeaderTitle'>{t('Search.AvailableAgents', { ns: 'agent' })}</div>
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
                  <div className='aa-ItemContent'>{t('Search.NoAgentsFound', { ns: 'agent' })}</div>
                </div>
              );
            },
          },
          onSelect: async ({ item }) => {
            try {
              const tabStore = useTabStore.getState();
              const { activeTabId, transformTabType, addTab } = tabStore;

              // Create agent instance
              const agent = await window.service.agentInstance.createAgent(item.id);
              // Check if we have an active tab
              if (activeTabId) {
                // Transform the current active tab to chat type
                transformTabType(activeTabId, TabType.CHAT, {
                  title: item.name,
                  agentId: agent.id,
                  agentDefId: agent.agentDefId,
                });
              } else {
                // If no active tab, create a new one
                await addTab(TabType.CHAT, {
                  title: item.name,
                  agentId: agent.id,
                  agentDefId: agent.agentDefId,
                });
              }
            } catch (error) {
              console.error(t('Search.FailedToCreateChatWithAgent', { ns: 'agent' }), error);
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
