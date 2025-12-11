import { Box, Chip, LinearProgress, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../../Agent/store/agentChatStore';

/**
 * Debounce delay before showing the progress bar (ms)
 * Prevents flashing for quick operations
 */
const SHOW_DELAY_MS = 200;

interface PreviewProgressBarProps {
  /**
   * Whether to show the progress bar
   */
  show: boolean;
}

/**
 * Progress bar component for preview generation
 * Shows real-time progress and current processing step
 * Uses debounce to prevent flashing for quick operations
 */
export const PreviewProgressBar: React.FC<PreviewProgressBarProps> = ({ show }) => {
  const {
    previewProgress,
    previewCurrentStep,
    previewCurrentPlugin,
    previewLoading,
  } = useAgentChatStore(
    useShallow((state) => ({
      previewProgress: state.previewProgress,
      previewCurrentStep: state.previewCurrentStep,
      previewCurrentPlugin: state.previewCurrentPlugin,
      previewLoading: state.previewLoading,
    })),
  );

  // Debounce visibility to prevent flashing for quick operations
  const [showDelayed, setShowDelayed] = useState(false);

  useEffect(() => {
    if (show && previewLoading) {
      // Delay showing the progress bar
      const timer = setTimeout(() => {
        setShowDelayed(true);
      }, SHOW_DELAY_MS);
      return () => {
        clearTimeout(timer);
      };
    } else {
      // Hide immediately when loading is done
      setShowDelayed(false);
    }
  }, [show, previewLoading]);

  if (!showDelayed) {
    return null;
  }

  const progressPercentage = Math.round(previewProgress * 100);

  return (
    <Box sx={{ width: '100%', mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant='body2' color='text.secondary'>
          {previewCurrentStep}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {previewCurrentPlugin && (
            <Chip
              label={previewCurrentPlugin}
              size='small'
              variant='outlined'
              color='primary'
            />
          )}
          <Typography variant='body2' color='text.secondary'>
            {progressPercentage}%
          </Typography>
        </Box>
      </Box>

      <LinearProgress
        variant='determinate'
        value={progressPercentage}
        sx={{
          height: 6,
          borderRadius: 3,
          '& .MuiLinearProgress-bar': {
            borderRadius: 3,
          },
        }}
      />

      <Typography variant='caption' color='text.secondary' sx={{ mt: 1, display: 'block' }}>
        ⚡ Live preview - this is not the final version and is still loading
      </Typography>
    </Box>
  );
};
