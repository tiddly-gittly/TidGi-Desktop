import { Box, Chip, LinearProgress, Typography } from '@mui/material';
import type { PromptPreviewDialogState } from 'memeloop';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  state: PromptPreviewDialogState;
}

/**
 * Progress bar component for preview generation
 * Shows real-time progress and current processing step
 * Uses debounce to prevent flashing for quick operations
 */
export const PreviewProgressBar: React.FC<PreviewProgressBarProps> = ({ show, state }) => {
  const { t } = useTranslation('agent');
  const {
    progress,
    currentStep,
    currentStepDisplay,
    currentPlugin,
    loading,
  } = state;

  // Debounce visibility to prevent flashing for quick operations
  const [showDelayed, setShowDelayed] = useState(false);

  useEffect(() => {
    if (show && loading) {
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
  }, [loading, show]);

  if (!showDelayed) {
    return null;
  }

  const progressPercentage = Math.round(progress * 100);

  return (
    <Box sx={{ width: '100%', mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography
          variant='body2'
          sx={{
            color: 'text.secondary',
          }}
        >
          {t(stepTranslationKey(currentStep), {
            plugin: currentPlugin ?? t('Prompt.Progress.UnknownTool'),
          })}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {currentPlugin && (
            <Chip
              label={currentPlugin}
              size='small'
              variant='outlined'
              color='primary'
            />
          )}
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
            {progressPercentage}%
          </Typography>
        </Box>
      </Box>
      {currentStepDisplay && (
        <Typography
          variant='caption'
          sx={{ color: 'text.secondary', mb: 1, display: 'block', overflowWrap: 'anywhere' }}
        >
          {currentStepDisplay}
        </Typography>
      )}
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
      <Typography
        variant='caption'
        sx={{
          color: 'text.secondary',
          mt: 1,
          display: 'block',
        }}
      >
        {t('Prompt.Progress.LivePreview')}
      </Typography>
    </Box>
  );
};

const STEP_TRANSLATION_KEYS: Record<PromptPreviewDialogState['currentStep'], string> = {
  idle: 'Prompt.Progress.Starting',
  starting: 'Prompt.Progress.Starting',
  preparing: 'Prompt.Progress.Starting',
  plugin: 'Prompt.Progress.ProcessingTool',
  flatten: 'Prompt.Progress.Flattening',
  finalize: 'Prompt.Progress.Finalizing',
  completing: 'Prompt.Progress.Completing',
  complete: 'Prompt.Progress.Complete',
  error: 'Prompt.Progress.Error',
};

function stepTranslationKey(step: PromptPreviewDialogState['currentStep']): string {
  return STEP_TRANSLATION_KEYS[step];
}
