// Input container component for message entry

import SendIcon from '@mui/icons-material/Send';
import CancelIcon from '@mui/icons-material/StopCircle';
import { Box, IconButton, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

const Container = styled(Box)`
  display: flex;
  padding: 12px 16px;
  gap: 12px;
  border-top: 1px solid ${props => props.theme.palette.divider};
  background-color: ${props => props.theme.palette.background.paper};
`;

const InputField = styled(TextField)`
  flex: 1;
  .MuiOutlinedInput-root {
    border-radius: 20px;
    padding-right: 12px;
  }
`;

interface InputContainerProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onCancel: () => void;
  onKeyPress: (event: React.KeyboardEvent) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

/**
 * Input container component for message entry
 * Displays a send button that changes to cancel button during streaming
 */
export const InputContainer: React.FC<InputContainerProps> = ({
  value,
  onChange,
  onSend,
  onCancel,
  onKeyPress,
  disabled = false,
  isStreaming = false,
}) => {
  const { t } = useTranslation('agent');

  return (
    <Container>
      <InputField
        value={value}
        onChange={onChange}
        onKeyDown={onKeyPress}
        placeholder={t('Chat.InputPlaceholder')}
        variant='outlined'
        fullWidth
        multiline
        maxRows={4}
        disabled={disabled}
        slotProps={{
          input: {
            inputProps: { 'data-testid': 'agent-message-input' },
            endAdornment: (
              <IconButton
                onClick={isStreaming ? onCancel : onSend}
                // During streaming, cancel button should always be enabled
                // Only disable the button when not streaming and the input is empty
                disabled={isStreaming ? false : (disabled || !value.trim())}
                color={isStreaming ? 'error' : 'primary'}
                title={isStreaming ? t('Chat.Cancel') : t('Chat.Send')}
              >
                {isStreaming ? <CancelIcon /> : <SendIcon />}
              </IconButton>
            ),
          },
        }}
      />
    </Container>
  );
};
