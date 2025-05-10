import { Box, Button, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useTabStore } from '../../store/tabStore';
import { TabType } from '../../types/tab';

/** Props for empty state component */
interface EmptyStateProps {
  /** Title i18n string key */
  title: string;
  /** Description i18n string key */
  description: string;
  /** Action button label i18n string key */
  actionLabel?: string;
}

/** Empty state container styled component */
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

/** Title styled component */
const Title = styled(Typography)`
  font-size: 24px;
  margin-bottom: 16px;
  color: ${props => props.theme.palette.text.primary};
`;

/** Description text styled component */
const Description = styled(Typography)`
  font-size: 16px;
  max-width: 500px;
  margin-bottom: 24px;
  color: ${props => props.theme.palette.text.secondary};
`;

/** Action button styled component */
const ActionButton = styled(Button)`
  min-width: 150px;
`;

/**
 * Empty State Display Component
 * Shows a page with a title, description, and optional action button
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, actionLabel }) => {
  const { t } = useTranslation('agent');
  const { addTab } = useTabStore();

  /** Handle action button click to create a new tab */
  const handleAction = () => {
    addTab(TabType.NEW_TAB);
  };

  return (
    <EmptyContainer>
      <Title variant='h4'>{t(title)}</Title>
      <Description variant='body1'>{t(description)}</Description>
      {actionLabel && (
        <ActionButton
          variant='contained'
          color='primary'
          onClick={handleAction}
        >
          {t(actionLabel)}
        </ActionButton>
      )}
    </EmptyContainer>
  );
};
