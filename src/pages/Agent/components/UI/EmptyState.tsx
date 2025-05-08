import React from 'react';
import styled from 'styled-components';
import { Box, Typography, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useTabStore } from '../../store/tabStore';
import { TabType } from '../../types/tab';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
}

const EmptyContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  padding: 16px;
  text-align: center;
  background-color: ${props => props.theme.palette.background.default};
`;

const Title = styled(Typography)`
  font-size: 24px;
  margin-bottom: 16px;
  color: ${props => props.theme.palette.text.primary};
`;

const Description = styled(Typography)`
  font-size: 16px;
  max-width: 500px;
  margin-bottom: 24px;
  color: ${props => props.theme.palette.text.secondary};
`;

const ActionButton = styled(Button)`
  min-width: 150px;
`;

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, actionLabel }) => {
  const { t } = useTranslation('agent');
  const { addTab } = useTabStore();
  
  const handleAction = () => {
    addTab(TabType.NEW_TAB);
  };
  
  return (
    <EmptyContainer>
      <Title variant="h4">{t(title)}</Title>
      <Description variant="body1">{t(description)}</Description>
      {actionLabel && (
        <ActionButton 
          variant="contained" 
          color="primary"
          onClick={handleAction}
        >
          {t(actionLabel)}
        </ActionButton>
      )}
    </EmptyContainer>
  );
};