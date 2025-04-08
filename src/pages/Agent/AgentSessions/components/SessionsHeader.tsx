import { getBuildInPageIcon } from '@services/pages/getBuildInPageIcon';
import { PageType } from '@services/pages/interface';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Link } from 'wouter';

const Header = styled.div`
  padding: 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
  display: flex;
  gap: 8px;
`;

const NewSessionButton = styled.button`
  flex: 1;
  padding: 8px 16px;
  background-color: ${props => props.theme.palette.primary.main};
  color: ${props => props.theme.palette.primary.contrastText};
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${props => props.theme.palette.primary.dark};
  }
`;

const NewAgentButton = styled(Link)`
  padding: 8px;
  background-color: ${props => props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'};
  color: ${props => props.theme.palette.text.primary};
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${props => props.theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'};
  }
`;

interface SessionsHeaderProps {
  onNewSession: () => void;
}

export const SessionsHeader: React.FC<SessionsHeaderProps> = ({ onNewSession }) => {
  const { t } = useTranslation('agent');

  return (
    <Header>
      <NewSessionButton onClick={onNewSession}>
        {t('Chat.NewSession', { ns: 'agent' })}
      </NewSessionButton>
      <NewAgentButton to='/agents'>
        {getBuildInPageIcon(PageType.agent)}
      </NewAgentButton>
    </Header>
  );
};
