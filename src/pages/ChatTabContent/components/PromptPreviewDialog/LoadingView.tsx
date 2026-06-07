import { Box, CircularProgress, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface LoadingViewProps {
  message?: string;
}

/**
 * Loading state component with spinner and messages
 */
export const LoadingView: React.FC<LoadingViewProps> = ({ message }) => {
  const { t } = useTranslation('agent');

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 300,
        gap: 2
      }}>
      <CircularProgress />
      <Typography variant='body2' sx={{
        color: 'text.secondary'
      }}>
        {message || t('Prompt.Loading')}
      </Typography>
      <Typography
        variant='caption'
        sx={{
          color: 'text.secondary',
          mt: 1,
          maxWidth: '80%',
          textAlign: 'center'
        }}>
        {t('Prompt.AutoRefresh')}
      </Typography>
    </Box>
  );
};
