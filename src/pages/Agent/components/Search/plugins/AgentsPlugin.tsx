import { AutocompletePlugin } from '@algolia/autocomplete-js';
import type { Agent } from '@services/agent/interface';
import { nanoid } from 'nanoid';
import { TabItem, TabType } from '../../../types/tab';

// 定义 BaseItem 类型
type BaseItem = Record<string, unknown>;

interface AgentsPluginProps {
  onAgentSelect: (tabType: TabType, initialData?: Partial<TabItem> & { insertPosition?: number | undefined }) => TabItem;
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
              const task = await window.service.agent.createTask(item.id);
              const messages = (task.messages || []).map(message => {
                // 提取文本内容
                let textContent = '';
                for (const part of message.parts) {
                  if (part && typeof part === 'object' && 'text' in part) {
                    const textPart = part as { text: string };
                    if (textPart.text) textContent += textPart.text;
                  }
                }

                // 映射消息角色
                let role: 'user' | 'assistant' | 'system';
                if (message.role === 'agent') role = 'assistant';
                else if (message.role === 'user') role = 'user';
                else role = 'system';

                const id = message.metadata?.id && typeof message.metadata.id === 'string'
                  ? message.metadata.id
                  : nanoid();

                const timestamp = message.metadata?.created && typeof message.metadata.created === 'string'
                  ? new Date(message.metadata.created).getTime()
                  : Date.now();

                return { id, role, content: textContent, timestamp };
              });

              onAgentSelect(TabType.CHAT, { title: item.name, messages });
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
  // 获取属性值并转换为字符串
  const attributeValue = hit[attribute];
  let value = '';

  if (typeof attributeValue === 'string') {
    value = attributeValue;
  } else if (attributeValue === null || attributeValue === undefined) {
    // 空值处理
  } else {
    // 尝试安全地转换为字符串
    try {
      const stringValue = String(attributeValue);
      if (stringValue !== '[object Object]') {
        value = stringValue;
      }
    } catch {
      // 转换失败，保持空字符串
    }
  }

  // 如果没有查询或值为空，直接返回值
  if (!query || !value) return value;

  // 执行搜索和高亮
  const lowerCaseValue = value.toLowerCase();
  const lowerCaseQuery = query.toLowerCase();
  const startIndex = lowerCaseValue.indexOf(lowerCaseQuery);

  if (startIndex === -1) return value;

  const endIndex = startIndex + lowerCaseQuery.length;

  return value.substring(0, startIndex) +
    `<mark>${value.substring(startIndex, endIndex)}</mark>` +
    value.substring(endIndex);
}
