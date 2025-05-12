/* eslint-disable unicorn/prevent-abbreviations */
import PersonIcon from '@mui/icons-material/Person';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TuneIcon from '@mui/icons-material/Tune';
import { Avatar, Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import { nanoid } from 'nanoid';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ModelParametersDialog } from '@/pages/Preferences/sections/ExternalAPI/components/ModelParametersDialog';
import { useTaskConfigManagement } from '@/pages/Preferences/sections/ExternalAPI/useAIConfigManagement';
import { useTabStore } from '../../../store/tabStore';
import { IChatTab } from '../../../types/tab';

interface ChatTabContentProps {
  tab: IChatTab;
}

const Container = styled(Box)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

const ChatHeader = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
`;

const Title = styled(Typography)`
  font-weight: 600;
`;

const MessagesContainer = styled(Box)`
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-color: ${props => props.theme.palette.background.default};
`;

const MessageBubble = styled(Box)<{ $isUser: boolean }>`
  display: flex;
  gap: 12px;
  max-width: 80%;
  align-self: ${props => props.$isUser ? 'flex-end' : 'flex-start'};
`;

const MessageAvatar = styled(Avatar)<{ $isUser: boolean }>`
  background-color: ${props => props.$isUser ? props.theme.palette.primary.main : props.theme.palette.secondary.main};
  color: ${props => props.$isUser ? props.theme.palette.primary.contrastText : props.theme.palette.secondary.contrastText};
`;

const MessageContent = styled(Box)<{ $isUser: boolean }>`
  background-color: ${props => props.$isUser ? props.theme.palette.primary.light : props.theme.palette.background.paper};
  color: ${props => props.$isUser ? props.theme.palette.primary.contrastText : props.theme.palette.text.primary};
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  position: relative;
`;

const InputContainer = styled(Box)`
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

export const ChatTabContent: React.FC<ChatTabContentProps> = ({ tab }) => {
  const { t } = useTranslation('agent');
  const { updateTabData } = useTabStore();
  const [inputMessage, setInputMessage] = useState('');
  const [parametersDialogOpen, setParametersDialogOpen] = useState(false);
  const agentId = tab.agentId;
  const agentDefId = tab.agentDefId;
  const { config, handleConfigChange } = useTaskConfigManagement({
    agentId,
    agentDefId,
  });

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(event.target.value);
  }, []);

  const openParametersDialog = useCallback(() => {
    setParametersDialogOpen(true);
  }, []);

  const closeParametersDialog = useCallback(() => {
    setParametersDialogOpen(false);
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim()) return;

    const newMessage = {
      id: nanoid(),
      role: 'user' as const,
      content: inputMessage,
      timestamp: Date.now(),
    };

    const updatedMessages = [...tab.messages, newMessage];

    // Add a simple AI reply
    const aiReply = {
      id: nanoid(),
      role: 'assistant' as const,
      content: t('Chat.AiReplyPlaceholder'),
      timestamp: Date.now() + 1,
    };

    updateTabData(tab.id, {
      messages: [...updatedMessages, aiReply],
    });

    setInputMessage('');
  }, [inputMessage, tab.messages, tab.id, updateTabData, t]);

  const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  return (
    <Container>
      <ChatHeader>
        <Title variant='h6'>{t(tab.title)}</Title>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('Preference.ModelParameters', { ns: 'agent' })}>
            <IconButton onClick={openParametersDialog} size='small'>
              <TuneIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </ChatHeader>

      <MessagesContainer>
        {tab.messages.length === 0
          ? (
            <Box sx={{ textAlign: 'center', color: 'text.secondary', mt: 4 }}>
              <SmartToyIcon sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant='body1' sx={{ mt: 2 }}>
                {t('Chat.StartConversation')}
              </Typography>
            </Box>
          )
          : (
            tab.messages.map(message => (
              <MessageBubble key={message.id} $isUser={message.role === 'user'}>
                <MessageAvatar $isUser={message.role === 'user'}>
                  {message.role === 'user' ? <PersonIcon /> : <SmartToyIcon />}
                </MessageAvatar>
                <MessageContent $isUser={message.role === 'user'}>
                  <Typography variant='body1'>{message.content}</Typography>
                </MessageContent>
              </MessageBubble>
            ))
          )}
      </MessagesContainer>

      <InputContainer>
        <InputField
          fullWidth
          multiline
          maxRows={4}
          variant='outlined'
          placeholder={t('Chat.TypePlaceholder')}
          value={inputMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          slotProps={{
            input: {
              endAdornment: (
                <Button
                  color='primary'
                  disabled={!inputMessage.trim()}
                  onClick={handleSendMessage}
                  sx={{ minWidth: 'auto' }}
                >
                  <SendIcon />
                </Button>
              ),
            },
          }}
        />
      </InputContainer>
      <ModelParametersDialog
        open={parametersDialogOpen}
        onClose={closeParametersDialog}
        config={config}
        onSave={handleConfigChange}
      />
    </Container>
  );
};
