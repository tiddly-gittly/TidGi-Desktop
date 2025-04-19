import React, { FormEvent, KeyboardEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { IconButton, Tooltip } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';

const Container = styled.div`
  padding: 16px;
  border-top: 1px solid ${props => props.theme.palette.divider};
  background-color: ${props =>
  props.theme.palette.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(0, 0, 0, 0.02)'};
`;

const InputForm = styled.form`
  display: flex;
  gap: 8px;
`;

const TextArea = styled.textarea`
  flex: 1;
  padding: 12px;
  border: 1px solid ${props => props.theme.palette.divider};
  border-radius: 4px;
  resize: none;
  font-family: inherit;
  min-height: 48px;
  max-height: 200px;
  background-color: ${props => props.theme.palette.background.paper};
  color: ${props => props.theme.palette.text.primary};
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.palette.primary.main};
  }
  
  &::placeholder {
    color: ${props => props.theme.palette.text.secondary};
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Button = styled.button`
  padding: 0 16px;
  background-color: ${props => props.theme.palette.primary.main};
  color: ${props => props.theme.palette.primary.contrastText};
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  
  &:hover {
    background-color: ${props => props.theme.palette.primary.dark};
  }
  
  &:disabled {
    background-color: ${props =>
  props.theme.palette.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.12)'};
    color: ${props =>
  props.theme.palette.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.3)'
    : 'rgba(0, 0, 0, 0.26)'};
    cursor: not-allowed;
  }
`;

const CancelButton = styled(Button)`
  background-color: ${props => props.theme.palette.error.main};
  
  &:hover {
    background-color: ${props => props.theme.palette.error.dark};
  }
`;

const PreviewButton = styled(IconButton)`
  color: ${props => props.theme.palette.primary.main};
`;

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onCancelRequest: () => void;
  onPreviewPrompts?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onCancelRequest,
  onPreviewPrompts,
  isLoading,
  isStreaming,
}) => {
  const { t } = useTranslation('agent');
  const [inputValue, setInputValue] = useState<string>('');
  const inputReference = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!inputValue.trim() || isLoading || isStreaming) return;

    onSendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  const adjustTextareaHeight = () => {
    if (inputReference.current) {
      inputReference.current.style.height = 'auto';
      inputReference.current.style.height = `${inputReference.current.scrollHeight}px`;
    }
  };

  return (
    <Container>
      <InputForm onSubmit={handleSubmit}>
        <TextArea
          ref={inputReference}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            adjustTextareaHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('Chat.InputPlaceholder', { ns: 'agent' })}
          disabled={isLoading || isStreaming}
          rows={1}
        />
        <ButtonGroup>
          {onPreviewPrompts && (
            <Tooltip title={t('Chat.PromptPreview.ButtonTooltip', { ns: 'agent' })}>
              <PreviewButton
                size="small"
                onClick={onPreviewPrompts}
                disabled={isLoading || isStreaming}
              >
                <VisibilityIcon />
              </PreviewButton>
            </Tooltip>
          )}
          {isStreaming
            ? (
              <CancelButton type='button' onClick={onCancelRequest}>
                {t('Chat.Cancel', { ns: 'agent' })}
              </CancelButton>
            )
            : (
              <Button type='submit' disabled={isLoading || isStreaming || !inputValue.trim()}>
                {t('Chat.Send', { ns: 'agent' })}
              </Button>
            )}
        </ButtonGroup>
      </InputForm>
    </Container>
  );
};
