/* eslint-disable unicorn/prevent-abbreviations */
import PersonIcon from '@mui/icons-material/Person';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TuneIcon from '@mui/icons-material/Tune';
import { Avatar, Box, Button, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ModelParametersDialog } from '@/pages/Preferences/sections/ExternalAPI/components/ModelParametersDialog';
import { useTaskConfigManagement } from '@/pages/Preferences/sections/ExternalAPI/useAIConfigManagement';
import { useAgentChatStore } from '../../../store/agentChatStore';
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
  const [inputMessage, setInputMessage] = useState('');
  const [parametersDialogOpen, setParametersDialogOpen] = useState(false);
  const agentId = tab.agentId;
  const agentDefId = tab.agentDefId;

  // Use store to get and manage Agent data
  const { messages, loading, error, agent, fetchAgent, subscribeToUpdates, sendMessage, createAgent } = useAgentChatStore();

  // Initialize and subscribe to updates
  useEffect(() => {
    let cleanupSubscription: (() => void) | undefined;

    if (agentId) {
      // If we have agentId, fetch and subscribe to updates
      void fetchAgent(agentId);
      cleanupSubscription = subscribeToUpdates(agentId);
    } else if (agentDefId) {
      // If we don't have agentId but have agentDefId, create a new Agent
      void createAgent(agentDefId);
    }

    // Cleanup subscription when component unmounts
    return () => {
      if (cleanupSubscription) cleanupSubscription();
    };
  }, [agentId, agentDefId, fetchAgent, subscribeToUpdates, createAgent]);

  const { config, handleConfigChange } = useTaskConfigManagement({
    agentId: agent?.id,
    agentDefId: agent?.agentDefId,
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

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || !agentId) return;

    try {
      await sendMessage(agentId, inputMessage);
      setInputMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    }
  }, [inputMessage, sendMessage, agentId]);

  const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  }, [handleSendMessage]);

  return (
    <Container>
      <ChatHeader>
        <Title variant='h6'>{agent?.name || t(tab.title)}</Title>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {loading && <CircularProgress size={20} sx={{ mr: 1 }} color='primary' />}
          <Tooltip title={t('Preference.ModelParameters', { ns: 'agent' })}>
            <IconButton onClick={openParametersDialog} size='small'>
              <TuneIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </ChatHeader>

      <MessagesContainer>
        {loading && messages.length === 0
          ? (
            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <CircularProgress size={40} color='primary' />
              <Typography variant='body1' sx={{ mt: 2 }}>
                {t('Chat.Loading')}
              </Typography>
            </Box>
          )
          : error
          ? (
            <Box sx={{ textAlign: 'center', color: 'error.main', mt: 4 }}>
              <Typography variant='body1'>
                {t('Chat.Error')}: {error.message}
              </Typography>
            </Box>
          )
          : messages.length === 0
          ? (
            <Box sx={{ textAlign: 'center', color: 'text.secondary', mt: 4 }}>
              <SmartToyIcon sx={{ fontSize: 48, opacity: 0.5 }} />
              <Typography variant='body1' sx={{ mt: 2 }}>
                {t('Chat.StartConversation')}
              </Typography>
            </Box>
          )
          : (
            messages.map(message => (
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
                  disabled={!inputMessage.trim() || loading}
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
