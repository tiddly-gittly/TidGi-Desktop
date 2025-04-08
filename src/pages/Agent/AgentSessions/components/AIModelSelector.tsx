/* eslint-disable @typescript-eslint/no-floating-promises */
import { AIProviderConfig, AISessionConfig } from '@services/agent/interface';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useAgentStore } from '../store';

const Container = styled.div`
  margin-bottom: 10px;
`;

const SelectWrapper = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
`;

const Select = styled.select`
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid ${props => props.theme.palette.divider};
  background-color: ${props => props.theme.palette.background.paper};
  color: ${props => props.theme.palette.text.primary};
  flex: 1;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.palette.primary.main};
  }
`;

const Label = styled.label`
  display: block;
  font-size: 0.9rem;
  margin-bottom: 4px;
  color: ${props => props.theme.palette.text.secondary};
`;

const SystemPromptInput = styled.textarea`
  width: 100%;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid ${props => props.theme.palette.divider};
  background-color: ${props => props.theme.palette.background.paper};
  color: ${props => props.theme.palette.text.primary};
  resize: vertical;
  min-height: 60px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.palette.primary.main};
  }
`;

const TemperatureSlider = styled.input`
  width: 100%;
  margin: 8px 0;
`;

const TemperatureValue = styled.span`
  font-size: 0.8rem;
  color: ${props => props.theme.palette.text.secondary};
  margin-left: 8px;
`;

interface AIModelSelectorProps {
  sessionId?: string;
}

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({ sessionId }) => {
  const { t } = useTranslation('agent');
  const providers = useAgentStore(state => state.providers);
  const updateSessionAIConfig = useAgentStore(state => state.updateSessionAIConfig);
  const currentConfig = useAgentStore(state => state.getSessionAIConfig(sessionId));

  // 如果没有当前配置，使用默认配置
  const config: AISessionConfig = currentConfig || {
    provider: 'siliconflow', // 默认使用 siliconflow
    model: 'Qwen/Qwen2.5-7B-Instruct', // 使用默认模型
    temperature: 0.7,
    systemPrompt: 'You are a helpful assistant.',
  };

  // 获取当前提供商的配置
  const currentProvider = useMemo(() => {
    return providers.find(p => p.provider === config.provider) || providers[0];
  }, [providers, config.provider]);

  // 更新提供商
  const handleProviderChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = event.target.value as AIProviderConfig['provider'];
    const providerConfig = providers.find(p => p.provider === newProvider);

    if (providerConfig) {
      const newConfig = {
        ...config,
        provider: newProvider,
        model: providerConfig.models[0], // 使用新提供商的第一个模型作为默认值
      };

      updateSessionAIConfig(sessionId, newConfig);
    }
  }, [providers, config, sessionId, updateSessionAIConfig]);

  // 更新模型
  const handleModelChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    updateSessionAIConfig(sessionId, {
      ...config,
      model: event.target.value,
    });
  }, [config, sessionId, updateSessionAIConfig]);

  // 更新温度
  const handleTemperatureChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    updateSessionAIConfig(sessionId, {
      ...config,
      temperature: parseFloat(event.target.value),
    });
  }, [config, sessionId, updateSessionAIConfig]);

  // 更新系统提示词
  const handleSystemPromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateSessionAIConfig(sessionId, {
      ...config,
      systemPrompt: event.target.value,
    });
  }, [config, sessionId, updateSessionAIConfig]);

  return (
    <Container>
      <Label>{t('AI.Provider', { defaultValue: 'AI 提供商' })}</Label>
      <SelectWrapper>
        <Select value={config.provider} onChange={handleProviderChange}>
          {providers.map((provider) => (
            <option key={provider.provider} value={provider.provider}>
              {provider.provider.charAt(0).toUpperCase() + provider.provider.slice(1)}
            </option>
          ))}
        </Select>

        <Select value={config.model} onChange={handleModelChange}>
          {currentProvider.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          )) || <option value=''>加载中...</option>}
        </Select>
      </SelectWrapper>

      <Label>
        {t('AI.Temperature', { defaultValue: '温度' })}
        <TemperatureValue>{config.temperature?.toFixed(1)}</TemperatureValue>
      </Label>
      <TemperatureSlider
        type='range'
        min='0'
        max='1'
        step='0.1'
        value={config.temperature}
        onChange={handleTemperatureChange}
      />

      <Label>{t('AI.SystemPrompt', { defaultValue: '系统提示词' })}</Label>
      <SystemPromptInput
        value={config.systemPrompt}
        onChange={handleSystemPromptChange}
        placeholder={t('AI.SystemPromptPlaceholder', { defaultValue: '设置AI的行为指南...' })}
      />
    </Container>
  );
};
