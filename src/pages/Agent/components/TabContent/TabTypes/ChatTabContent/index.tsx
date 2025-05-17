// Chat tab content component - Modular version with message rendering system

import { Box, CircularProgress, Typography } from '@mui/material';
import { AgentInstanceMessage } from '@services/agentInstance/interface';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Import internal components
import { ChatHeader } from './components/ChatHeader';
import { InputContainer } from './components/InputContainer';
import { MessagesContainer } from './components/MessagesContainer';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';

// Import custom hooks
import { useMessageHandling } from './hooks/useMessageHandling';
import { useRegisterMessageRenderers } from './hooks/useMessageRendering';
import { useScrollHandling } from './hooks/useScrollHandling';

// Import utils
import { isChatTab } from './utils/tabTypeGuards';

// Import store hooks to fetch agent data
import { useAgentChatStore } from '../../../../store/agentChatStore';
import { TabItem } from '../../../../types/tab';

/**
 * Props interface for ChatTabContent component
 * Only accepts a tab object as its single prop
 */
interface ChatTabContentProps {
  tab: TabItem; // Tab will be checked if it's a chat tab
}

/**
 * Chat Tab Content Component
 * Displays a chat interface for interacting with an AI agent
 * Only works with IChatTab objects
 */
const ChatTabContent: React.FC<ChatTabContentProps> = ({ tab }) => {
  const { t } = useTranslation('agent');

  // Type checking
  if (!isChatTab(tab)) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography color='error'>
          {t('Agent.InvalidTabType', 'Invalid tab type. Expected chat tab.')}
        </Typography>
      </Box>
    );
  }

  // Get agent store
  const {
    fetchAgent,
    sendMessage: storeSendMessage,
    subscribeToUpdates,
    loading,
    error,
    agent,
  } = useAgentChatStore();

  // Initialize scroll handling
  const {
    isUserAtBottomReference,
    scrollToBottom,
    debouncedScrollToBottom,
    isUserAtBottom,
    hasInitialScrollBeenDone,
    markInitialScrollAsDone,
  } = useScrollHandling();

  // Initialize message handling
  const {
    message,
    parametersOpen,
    // Only use the variables that are needed
    handleOpenParameters,
    handleMessageChange,
    handleSendMessage,
    handleKeyPress,
  } = useMessageHandling({
    agentId: tab.agentId,
    sendMessage: storeSendMessage,
    isUserAtBottom,
    isUserAtBottomReference,
    debouncedScrollToBottom,
    agent,
  });

  // Register message renderers
  useRegisterMessageRenderers();

  // Setup agent subscription on mount or when tab.agentId changes
  useEffect(() => {
    if (!tab.agentId) return;

    // Fetch agent first
    void fetchAgent(tab.agentId);

    // Then setup subscription
    const unsub = subscribeToUpdates(tab.agentId);

    // Cleanup subscription on unmount or when tab.agentId changes
    return () => {
      if (unsub) unsub();
    };
  }, [tab.agentId, fetchAgent, subscribeToUpdates]);

  // Effect to handle initial scroll when agent is first loaded
  useEffect(() => {
    // Only scroll to bottom on initial agent load, not on every agent update
    if (agent && !loading && agent.messages.length > 0) {
      // Use a ref to track if initial scroll has happened for this agent
      const agentId = agent.id;

      // Check if we've already scrolled for this agent
      if (!hasInitialScrollBeenDone(agentId)) {
        // Scroll to bottom on initial load
        debouncedScrollToBottom();
        // Mark this agent as scrolled in our ref
        markInitialScrollAsDone(agentId);
      }
    }
  }, [agent?.id, loading, debouncedScrollToBottom, hasInitialScrollBeenDone, markInitialScrollAsDone]);

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    if (!agent?.messages.length) return;

    // Always use debounced scroll to prevent UI jumping for all message updates
    if (isUserAtBottomReference.current) {
      debouncedScrollToBottom();
    }
  }, [agent?.messages, isUserAtBottomReference, debouncedScrollToBottom]);

  // Organize messages for display
  const messages: AgentInstanceMessage[] = agent?.messages || [];
  const isWorking = loading || agent?.status.state === 'working';

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Chat header with title and model selector */}
      <ChatHeader
        title={agent?.name}
        loading={isWorking}
        agentId={tab.agentId}
        agentDefId={agent?.agentDefId}
        onOpenParameters={handleOpenParameters}
      />

      {/* Messages container with all chat bubbles */}
      <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <MessagesContainer messages={messages}>
          {/* Error state */}
          {error && (
            <Box sx={{ textAlign: 'center', p: 2, color: 'error.main' }}>
              <Typography>{error.message}</Typography>
            </Box>
          )}

          {/* Empty state */}
          {!loading && !error && messages.length === 0 && (
            <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
              <Typography>{t('Agent.StartConversation')}</Typography>
            </Box>
          )}

          {/* Loading state - when first loading the agent */}
          {loading && messages.length === 0 && (
            <Box sx={{ textAlign: 'center', p: 4 }}>
              <CircularProgress size={24} />
              <Typography sx={{ mt: 2 }}>{t('Agent.LoadingChat')}</Typography>
            </Box>
          )}
        </MessagesContainer>

        {/* Floating scroll to bottom button */}
        <ScrollToBottomButton scrollToBottom={scrollToBottom} />
      </Box>

      {/* Input container for typing messages */}
      <InputContainer
        value={message}
        onChange={handleMessageChange}
        onSend={handleSendMessage}
        onKeyPress={handleKeyPress}
        onOpenParameters={handleOpenParameters}
        disabled={!agent || isWorking}
      />

      {/* Model parameter dialog - Would be implemented in a separate component */}
      {parametersOpen && (
        /* Placeholder for parameters dialog - Implement or import the dialog component here */
        <div hidden={false}></div>
      )}
    </Box>
  );
};

export { ChatTabContent };
