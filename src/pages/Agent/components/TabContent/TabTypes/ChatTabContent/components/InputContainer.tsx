// Input container component for message entry

import SendIcon from '@mui/icons-material/Send';
import SettingsIcon from '@mui/icons-material/Settings';
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
  onKeyPress: (event: React.KeyboardEvent) => void;
  onOpenParameters: () => void;
  disabled?: boolean;
}

/**
 * Input container component for message entry
 */
export const InputContainer: React.FC<InputContainerProps> = ({
  value,
  onChange,
  onSend,
  onKeyPress,
  onOpenParameters,
  disabled = false,
}) => {
  const { t } = useTranslation('agent');

  return (
    <Container>
      <InputField
        value={value}
        onChange={onChange}
        onKeyDown={onKeyPress}
        placeholder={t('Agent.ChatInputPlaceholder')}
        variant='outlined'
        fullWidth
        multiline
        maxRows={4}
        disabled={disabled}
        slotProps={{
          input: {
            endAdornment: (
              <IconButton
                onClick={onSend}
                disabled={disabled || !value.trim()}
                color='primary'
              >
                <SendIcon />
              </IconButton>
            ),
          },
        }}
      />

      <IconButton
        onClick={onOpenParameters}
        title={t('Preference.ModelParameters')}
      >
        <SettingsIcon />
      </IconButton>
    </Container>
  );
};
