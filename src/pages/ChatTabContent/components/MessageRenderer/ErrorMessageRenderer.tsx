// Error message renderer component

import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Box, Button, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { PreferenceSections } from '@services/preferences/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageRendererProps } from './types';

const ErrorWrapper = styled(Box)`
  width: 100%;
`;

const ErrorContent = styled(Paper)`
  padding: 16px;
  background-color: ${props => props.theme.palette.error.light};
  border-radius: 8px;
  color: ${props => props.theme.palette.error.contrastText};
  margin-bottom: 12px;
`;

const ErrorHeader = styled(Box)`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
`;

const ErrorActions = styled(Box)`
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
`;

/**
 * Extract error details from message content and metadata
 */
function extractErrorDetails(message: MessageRendererProps['message']): {
  errorName: string;
  errorCode: string;
  provider: string;
  errorMessage: string;
} {
  // Default values
  let errorName = 'Error';
  let errorCode = 'UNKNOWN_ERROR';
  let provider = '';
  let errorMessage = message.content;

  // Check if metadata exists and contains error details
  if (message.metadata?.errorDetail) {
    const errorDetail = message.metadata.errorDetail as {
      name: string;
      code: string;
      provider: string;
      message?: string;
    };

    errorName = errorDetail.name || errorName;
    errorCode = errorDetail.code || errorCode;
    provider = errorDetail.provider || provider;
    errorMessage = errorDetail.message || message.content;
  }

  return {
    errorName,
    errorCode,
    provider,
    errorMessage,
  };
}

/**
 * Renderer for error messages
 * Displays error content in a highlighted box with action buttons
 */
export const ErrorMessageRenderer: React.FC<MessageRendererProps> = ({ message }) => {
  const { t } = useTranslation('agent');
  const { errorName, errorCode, provider, errorMessage } = extractErrorDetails(message);

  // Handle navigation to settings
  const handleGoToSettings = async () => {
    await window.service.window.open(WindowNames.preferences, { preferenceGotoTab: PreferenceSections.externalAPI });
  };

  // Check if this is a provider-related error that could be fixed in settings
  const isSettingsFixableError = ['MissingConfigError', 'MissingProviderError', 'AuthenticationError', 'MissingAPIKeyError', 'MissingBaseURLError'].includes(errorName) ||
    ['NO_DEFAULT_MODEL', 'PROVIDER_NOT_FOUND', 'AUTHENTICATION_FAILED', 'MISSING_API_KEY', 'MISSING_BASE_URL'].includes(errorCode);

  return (
    <ErrorWrapper data-testid='error-message'>
      <ErrorContent elevation={0}>
        <ErrorHeader>
          <WarningAmberIcon sx={{ mr: 1 }} />
          <Typography variant='subtitle1' fontWeight='bold'>
            {t('Chat.ConfigError.Title')}
          </Typography>
        </ErrorHeader>

        <Typography variant='body1'>
          {provider
            ? t(`Chat.ConfigError.${errorName}`, { provider }) || errorMessage
            : errorMessage}
        </Typography>

        {isSettingsFixableError && (
          <ErrorActions>
            <Button
              startIcon={<SettingsIcon />}
              variant='contained'
              color='primary'
              size='small'
              onClick={handleGoToSettings}
            >
              {t('Chat.ConfigError.GoToSettings')}
            </Button>
          </ErrorActions>
        )}
      </ErrorContent>
    </ErrorWrapper>
  );
};
