import { Box, CircularProgress, LinearProgress, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface LoadingViewProps {
  message?: string;
  progress?: number; // 0-1 progress value
  step?: string; // Current processing step
}

/**
 * Enhanced loading state component with progress indicator and step information
 */
export const LoadingView: React.FC<LoadingViewProps> = ({ message, progress, step }) => {
  const { t } = useTranslation('agent');

  const showProgress = typeof progress === 'number';
  const progressPercentage = showProgress ? Math.round(progress * 100) : 0;

  return (
    <Box
      display='flex'
      flexDirection='column'
      justifyContent='center'
      alignItems='center'
      minHeight={300}
      gap={2}
      sx={{ px: 3 }}
    >
      {/* Main spinner */}
      <CircularProgress 
        variant={showProgress ? 'determinate' : 'indeterminate'}
        value={progressPercentage}
        size={60}
      />
      
      {/* Progress percentage */}
      {showProgress && (
        <Typography variant='h6' color='primary' fontWeight='bold'>
          {progressPercentage}%
        </Typography>
      )}
      
      {/* Current step information */}
      {step && (
        <Typography variant='body1' color='text.primary' textAlign='center'>
          {step}
        </Typography>
      )}
      
      {/* Main loading message */}
      <Typography variant='body2' color='text.secondary' textAlign='center'>
        {message || t('Prompt.Loading')}
      </Typography>
      
      {/* Linear progress bar for better visual feedback */}
      {showProgress && (
        <Box sx={{ width: '100%', maxWidth: 400, mt: 2 }}>
          <LinearProgress 
            variant='determinate' 
            value={progressPercentage}
            sx={{ 
              height: 8, 
              borderRadius: 5,
              '& .MuiLinearProgress-bar': {
                borderRadius: 5,
              }
            }}
          />
        </Box>
      )}
      
      {/* Auto-refresh hint */}
      <Typography variant='caption' color='text.secondary' sx={{ mt: 1, maxWidth: '80%', textAlign: 'center' }}>
        {t('Prompt.AutoRefresh')}
      </Typography>
    </Box>
  );
};
