import React from 'react';
import { useLocation } from 'wouter';
import { styled } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useAgentStore } from '../../AgentTabs/store';

const NewTabButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  width: 100%;
  border: none;
  margin-top: auto;
  background-color: transparent;
  border-top: 1px solid ${props => props.theme.palette.divider};
  cursor: pointer;
  color: ${props => props.theme.palette.primary.main};
  &:hover {
    background-color: ${props => props.theme.palette.action.hover};
  }
`;

const AddIcon = styled.span`
  margin-right: 8px;
  font-size: 20px;
`;

export const NewAgentTab: React.FC = () => {
  const { t } = useTranslation('agent');
  const [, setLocation] = useLocation();
  
  const handleOpenNewTab = () => {
    setLocation('/new-tab');
  };

  return (
    <NewTabButton onClick={handleOpenNewTab}>
      <AddIcon>+</AddIcon>
      {t('NewTab.Title', '新标签页')}
    </NewTabButton>
  );
};