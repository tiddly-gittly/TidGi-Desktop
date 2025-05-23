import { Box, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

export interface LastUpdatedIndicatorProps {
  lastUpdated: Date | null;
  source: 'auto' | 'manual' | 'initial' | null;
}

/**
 * Component to display when the prompt preview was last updated
 * Shows timestamp and update method (manual, auto, or initial)
 */
export const LastUpdatedIndicator: React.FC<LastUpdatedIndicatorProps> = ({ lastUpdated, source }) => {
  const { t } = useTranslation('agent');
  
  if (!lastUpdated) return null;
  
  return (
    <Box
      sx={{
        mt: 2,
        pt: 1,
        borderTop: '1px dashed',
        borderColor: 'divider',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <Typography variant='caption' color='text.secondary'>
        {t('Prompt.LastUpdated', 'Last updated')}: {lastUpdated.toLocaleTimeString()}
        {source === 'auto' ? ` (${t('Prompt.AutoRefreshed', 'Auto')})` : ''}
        {source === 'manual' ? ` (${t('Prompt.ManuallyRefreshed', 'Manual')})` : ''}
      </Typography>
    </Box>
  );
};
