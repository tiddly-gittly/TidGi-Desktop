import React from 'react';
import { LinearProgress, Box, Typography, Chip } from '@mui/material';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../store/agentChatStore';

interface PreviewProgressBarProps {
  /**
   * Whether to show the progress bar
   */
  show: boolean;
}

/**
 * Progress bar component for preview generation
 * Shows real-time progress and current processing step
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

  if (!show || !previewLoading) {
    return null;
  }

  const progressPercentage = Math.round(previewProgress * 100);

  return (
    <Box sx={{ width: '100%', mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {previewCurrentStep}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {previewCurrentPlugin && (
            <Chip
              label={previewCurrentPlugin}
              size="small"
              variant="outlined"
              color="primary"
            />
          )}
          <Typography variant="body2" color="text.secondary">
            {progressPercentage}%
          </Typography>
        </Box>
      </Box>
      
      <LinearProgress
        variant="determinate"
        value={progressPercentage}
        sx={{
          height: 6,
          borderRadius: 3,
          '& .MuiLinearProgress-bar': {
            borderRadius: 3,
          },
        }}
      />
      
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        ⚡ Live preview - this is not the final version and is still loading
      </Typography>
    </Box>
  );
};
