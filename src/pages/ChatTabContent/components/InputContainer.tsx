// Input container component for message entry

import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CancelIcon from '@mui/icons-material/StopCircle';
import { Box, IconButton, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';

const Wrapper = styled(Box)`
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.palette.background.paper};
  border-top: 1px solid ${props => props.theme.palette.divider};
`;

const Container = styled(Box)`
  display: flex;
  padding: 12px 16px;
  gap: 12px;
  align-items: flex-end;
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
  selectedFile?: File;
  onFileSelect?: (file: File) => void;
  onClearFile?: () => void;
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
  selectedFile,
  onFileSelect,
  onClearFile,
}) => {
  const { t } = useTranslation('agent');
  const fileInputReference = React.useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewUrl(undefined);
    }
  }, [selectedFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.error('Selected file is not an image:', file.type);
        return;
      }
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        console.error('File size exceeds 10MB limit:', file.size);
        return;
      }
      if (onFileSelect) {
        onFileSelect(file);
      }
    }
    // Reset value so same file can be selected again if needed
    if (event.target) {
      event.target.value = '';
    }
  };

  return (
    <Wrapper>
      {selectedFile && previewUrl && (
        <Box sx={{ p: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{ position: 'relative', display: 'inline-block' }}
          >
            <Box
              component='img'
              src={previewUrl}
              data-testid='attachment-preview'
              sx={{
                height: 80,
                width: 'auto',
                borderRadius: 1,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: 'divider',
              }}
              onClick={() => {
                // Future: open preview dialog
                const win = window.open();
                if (win) {
                  const img = win.document.createElement('img');
                  img.src = previewUrl;
                  img.style.maxWidth = '100%';
                  win.document.body.append(img);
                }
              }}
            />
            <IconButton
              size='small'
              onClick={onClearFile}
              sx={{
                position: 'absolute',
                top: -8,
                right: -8,
                bgcolor: 'background.paper',
                boxShadow: 1,
                '&:hover': { bgcolor: 'background.default' },
              }}
            >
              <CloseIcon fontSize='small' />
            </IconButton>
          </Box>
        </Box>
      )}
      <Container>
        <input
          type='file'
          hidden
          ref={fileInputReference}
          accept='image/*'
          onChange={handleFileChange}
        />
        <IconButton
          onClick={() => fileInputReference.current?.click()}
          disabled={disabled || isStreaming}
          color={selectedFile ? 'primary' : 'default'}
          data-testid='agent-attach-button'
        >
          <AttachFileIcon />
        </IconButton>
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
                  data-testid='agent-send-button'
                  onClick={isStreaming ? onCancel : onSend}
                  // During streaming, cancel button should always be enabled
                  // Only disable the button when not streaming and the input is empty AND no file selected
                  disabled={isStreaming ? false : (disabled || (!value.trim() && !selectedFile))}
                  color={isStreaming ? 'error' : 'primary'}
                  title={isStreaming ? t('Chat.Cancel') : t('Chat.Send')}
                >
                  {isStreaming ? <CancelIcon data-testid='cancel-icon' /> : <SendIcon data-testid='send-icon' />}
                </IconButton>
              ),
            },
          }}
        />
      </Container>
    </Wrapper>
  );
};
