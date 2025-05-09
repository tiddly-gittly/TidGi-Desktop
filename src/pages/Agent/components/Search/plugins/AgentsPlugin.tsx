import { AutocompletePlugin } from '@algolia/autocomplete-js';
import type { Agent } from '@services/agent/interface';
import { TabType } from '../../../types/tab';

// 定义 BaseItem 类型
type BaseItem = Record<string, unknown>;

interface AgentsPluginProps {
  onAgentSelect: (tabType: TabType, data: unknown) => void;
}

// 创建前端显示用的智能体类型，不包含handler
type AgentDisplay = Omit<Agent, 'handler'> & BaseItem;

export const createAgentsPlugin = ({ onAgentSelect }: AgentsPluginProps): AutocompletePlugin<AgentDisplay, unknown> => {
  const plugin = {
    getSources({ query }) {
      return [
        {
          sourceId: 'agentsSource',
          getItems: async () => {
            try {
              // 使用 window.service.agent.getAgents 获取智能体列表
              const agents = await window.service.agent.getAgents();

              // 确保返回符合AgentDisplay类型的对象
              const agentItems = agents.map(agent => ({
                ...agent,
                // 不包含handler属性
              }));

              if (!query) {
                return agentItems as AgentDisplay[];
              }

              const lowerCaseQuery = query.toLowerCase();
              return agentItems
                .filter(agent =>
                  agent.name.toLowerCase().includes(lowerCaseQuery) ||
                  (agent.description && agent.description.toLowerCase().includes(lowerCaseQuery))
                ) as AgentDisplay[];
            } catch (error) {
              console.error('Failed to fetch agents:', error);
              return [];
            }
          },
          templates: {
            header() {
              return (
                <div className='aa-SourceHeader'>
                  <div className='aa-SourceHeaderTitle'>可用的智能体</div>
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
                  <div className='aa-ItemContent'>没有找到智能体</div>
                </div>
              );
            },
          },
          onSelect: async ({ item }) => {
            try {
              // 创建一个和此智能体聊天的新标签页
              const task = await window.service.agent.createTask(item.id);

              onAgentSelect(TabType.CHAT, {
                title: item.name,
                messages: task.messages || [],
              });
            } catch (error) {
              console.error('Failed to create chat with agent:', error);
            }
          },
        },
      ];
    },
  } satisfies AutocompletePlugin<AgentDisplay, unknown>;

  return plugin;
};

function highlightHits({
  hit,
  attribute,
  query,
}: {
  hit: AgentDisplay;
  attribute: string;
  query: string;
}): string {
  // 将值安全地转换为字符串
  const value = typeof hit[attribute] === 'string'
    ? hit[attribute]
    : String(hit[attribute] ?? '');

  if (!query) return value;

  const lowerCaseValue = value.toLowerCase();
  const lowerCaseQuery = query.toLowerCase();
  const startIndex = lowerCaseValue.indexOf(lowerCaseQuery);

  if (startIndex === -1) return value;

  const endIndex = startIndex + lowerCaseQuery.length;

  return value.substring(0, startIndex) +
    `<mark>${value.substring(startIndex, endIndex)}</mark>` +
    value.substring(endIndex);
}
