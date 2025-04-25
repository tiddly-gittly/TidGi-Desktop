import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { styled } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useAgentStore } from '../../AgentTabs/store';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 30px;
  background-color: ${props => props.theme.palette.background.default};
`;

const Header = styled.h1`
  font-size: 24px;
  margin-bottom: 30px;
  color: ${props => props.theme.palette.text.primary};
`;

const InputContainer = styled.div`
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  margin-bottom: 40px;
`;

const ChatInputForm = styled.form`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const InputField = styled.textarea`
  width: 100%;
  padding: 16px;
  border: 1px solid ${props => props.theme.palette.divider};
  border-radius: 8px;
  font-size: 16px;
  min-height: 100px;
  resize: vertical;
  background-color: ${props => props.theme.palette.background.paper};
  color: ${props => props.theme.palette.text.primary};
  &:focus {
    outline: none;
    border-color: ${props => props.theme.palette.primary.main};
  }
`;

const SendButton = styled.button`
  align-self: flex-end;
  margin-top: 12px;
  padding: 8px 16px;
  background-color: ${props => props.theme.palette.primary.main};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  &:hover {
    background-color: ${props => props.theme.palette.primary.dark};
  }
  &:disabled {
    background-color: ${props => props.theme.palette.action.disabledBackground};
    color: ${props => props.theme.palette.action.disabled};
    cursor: not-allowed;
  }
`;

const TemplateSection = styled.div`
  margin-top: auto;
`;

const TemplateTitle = styled.h2`
  font-size: 18px;
  margin-bottom: 16px;
  color: ${props => props.theme.palette.text.primary};
`;

const TemplatesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
`;

const TemplateCard = styled.div`
  padding: 16px;
  border: 1px solid ${props => props.theme.palette.divider};
  border-radius: 8px;
  cursor: pointer;
  background-color: ${props => props.theme.palette.background.paper};
  &:hover {
    border-color: ${props => props.theme.palette.primary.main};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`;

// 模型选择区域样式
const ModelSelectorWrapper = styled.div`
  margin: 20px 0;
  width: 100%;
  max-width: 600px;
  margin: 0 auto 20px auto;
`;

const ModelSelector = styled.select`
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid ${props => props.theme.palette.divider};
  background-color: ${props => props.theme.palette.background.paper};
  color: ${props => props.theme.palette.text.primary};
  font-size: 16px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.palette.primary.main};
  }
`;

export const NewTabPage: React.FC = () => {
  const { t } = useTranslation('agent');
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  
  const createNewTask = useAgentStore(state => state.createNewTask);
  const sendMessage = useAgentStore(state => state.sendMessage);
  const isCreatingTask = useAgentStore(state => state.creatingTask);
  const availableAgents = useAgentStore(state => state.availableAgents);
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || isCreatingTask) {
      return;
    }
    
    try {
      // 创建新任务时可以传入选择的智能体ID
      const taskId = await createNewTask(selectedAgentId);
      if (taskId) {
        await sendMessage(taskId, message);
        setLocation(`/session/${taskId}`);
        setMessage('');
      }
    } catch (error) {
      console.error('Failed to create task or send message:', error);
    }
  };
  
  const handleTemplateClick = (templatePrompt: string) => {
    setMessage(templatePrompt);
  };
  
  // 处理智能体选择
  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAgentId(e.target.value);
  };
  
  // 示例智能体模板
  const templates = [
    { id: 'summarize', name: '总结文档', prompt: '请帮我总结以下内容：' },
    { id: 'translate', name: '翻译助手', prompt: '请将以下内容翻译成英文：' },
    { id: 'code', name: '代码助手', prompt: '请帮我实现以下功能：' },
    { id: 'writing', name: '写作助手', prompt: '请帮我修改以下文章：' },
  ];
  
  return (
    <Container>
      <Header>{t('NewTab.Header', '新标签页')}</Header>
      
      <InputContainer>
        {/* 添加模型选择器 */}
        <ModelSelectorWrapper>
          <ModelSelector
            value={selectedAgentId}
            onChange={handleAgentChange}
          >
            <option value="">{t('NewTab.DefaultAgent', '默认智能体')}</option>
            {availableAgents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </ModelSelector>
        </ModelSelectorWrapper>
        
        <ChatInputForm onSubmit={handleSendMessage}>
          <InputField
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('NewTab.InputPlaceholder', '向AI提问...')}
          />
          <SendButton
            type="submit"
            disabled={!message.trim() || isCreatingTask}
          >
            {isCreatingTask ? t('NewTab.Creating', '创建中...') : t('NewTab.Send', '发送')}
          </SendButton>
        </ChatInputForm>
      </InputContainer>
      
      <TemplateSection>
        <TemplateTitle>{t('NewTab.Templates', '智能体模板')}</TemplateTitle>
        <TemplatesGrid>
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              onClick={() => handleTemplateClick(template.prompt)}
            >
              {template.name}
            </TemplateCard>
          ))}
        </TemplatesGrid>
      </TemplateSection>
    </Container>
  );
};