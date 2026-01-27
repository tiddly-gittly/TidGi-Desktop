// Chat tab content component - Modular version with message rendering system

import { Box, CircularProgress, Typography } from '@mui/material';
// Import services and hooks
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Import internal components
import { ChatHeader } from './components/ChatHeader';
import { InputContainer } from './components/InputContainer';
import { MessagesContainer } from './components/MessagesContainer';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';

// Import AIModelParametersDialog
import { AIModelParametersDialog } from '@/windows/Preferences/sections/ExternalAPI/components/AIModelParametersDialog';

// Import custom hooks
import { useMessageHandling } from './hooks/useMessageHandling';
import { useRegisterMessageRenderers } from './hooks/useMessageRendering';
import { useScrollHandling } from './hooks/useScrollHandling';

// Import utils
import { isChatTab } from './utils/tabTypeGuards';

// Import store hooks to fetch agent data
import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import { useShallow } from 'zustand/react/shallow';
import { AgentWithoutMessages } from '../Agent/store/agentChatStore/types';
import { TabItem } from '../Agent/types/tab';

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
export const ChatTabContent: React.FC<ChatTabContentProps> = ({ tab }) => {
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
    cancelAgent,
    subscribeToUpdates,
    updateAgent,
    loading,
    error,
    agent,
    streamingMessageIds, // Add streaming state to detect active generation
  } = useAgentChatStore(
    useShallow((state) => ({
      fetchAgent: state.fetchAgent,
      cancelAgent: state.cancelAgent,
      subscribeToUpdates: state.subscribeToUpdates,
      updateAgent: state.updateAgent,
      loading: state.loading,
      error: state.error,
      agent: state.agent,
      streamingMessageIds: state.streamingMessageIds,
    })),
  );

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
    setParametersOpen,
    // Only use the variables that are needed
    handleOpenParameters,
    handleMessageChange,
    handleSendMessage,
    handleKeyPress,
    selectedFile,
    handleFileSelect,
    handleClearFile,
    selectedWikiTiddlers,
    handleWikiTiddlerSelect,
    handleRemoveWikiTiddler,
  } = useMessageHandling({
    agentId: tab.agentId,
    isUserAtBottom,
    isUserAtBottomReference,
    debouncedScrollToBottom,
  });

  // Register message renderers
  useRegisterMessageRenderers();

  // Setup agent subscription on mount or when tab.agentId changes
  useEffect(() => {
    if (!tab.agentId) return;

    // Log the agentId being used for debugging
    void window.service.native.log('info', 'ChatTabContent: Setting up agent subscription', {
      agentId: tab.agentId,
      tabId: tab.id,
      tabTitle: tab.title,
    });

    // Fetch agent first
    void fetchAgent(tab.agentId);

    // Then setup subscription
    const unsub = subscribeToUpdates(tab.agentId);

    // Cleanup subscription on unmount or when tab.agentId changes
    return () => {
      if (unsub) unsub();
    };
  }, [tab.agentId, fetchAgent, subscribeToUpdates]);
  const orderedMessageIds = useAgentChatStore(
    useShallow((state) => state.orderedMessageIds),
  );

  // Effect to handle initial scroll when agent is first loaded
  useEffect(() => {
    // Only scroll to bottom on initial agent load, not on every agent update
    const currentAgent: AgentWithoutMessages | null = agent;
    if (currentAgent && !loading && orderedMessageIds.length > 0) {
      // Use a ref to track if initial scroll has happened for this agent
      const agentId = currentAgent.id;

      // Check if we've already scrolled for this agent
      if (!hasInitialScrollBeenDone(agentId)) {
        // Scroll to bottom on initial load
        debouncedScrollToBottom();
        // Mark this agent as scrolled in our ref
        markInitialScrollAsDone(agentId);
      }
    }
  }, [agent?.id, loading, debouncedScrollToBottom, hasInitialScrollBeenDone, markInitialScrollAsDone, orderedMessageIds]);

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    if (!orderedMessageIds.length) return;

    // Always use debounced scroll to prevent UI jumping for all message updates
    if (isUserAtBottomReference.current) {
      debouncedScrollToBottom();
    }
  }, [orderedMessageIds.length, isUserAtBottomReference, debouncedScrollToBottom]);
  const isWorking = loading || agent?.status.state === 'working'; /**
   * Check if any messages are currently streaming by examining the streamingMessageIds Set
   * When Set size > 0, it means there's at least one message being streamed from the AI
   */

  const isStreaming = streamingMessageIds.size > 0;
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
        title={tab.title}
        onOpenParameters={handleOpenParameters}
        loading={isWorking}
        inputText={message}
      />

      {/* Messages container with all chat bubbles */}
      <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <MessagesContainer messageIds={orderedMessageIds}>
          {/* Error state */}
          {error && (
            <Box sx={{ textAlign: 'center', p: 2, color: 'error.main' }}>
              <Typography>{error.message}</Typography>
            </Box>
          )}

          {/* Empty state */}
          {!loading && !error && orderedMessageIds.length === 0 && (
            <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
              <Typography>{t('Agent.StartConversation')}</Typography>
            </Box>
          )}

          {/* Loading state - when first loading the agent */}
          {loading && orderedMessageIds.length === 0 && (
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
        onCancel={cancelAgent}
        onKeyPress={handleKeyPress}
        disabled={!agent || isWorking}
        isStreaming={isStreaming}
        selectedFile={selectedFile}
        onFileSelect={handleFileSelect}
        onClearFile={handleClearFile}
        selectedWikiTiddlers={selectedWikiTiddlers}
        onWikiTiddlerSelect={handleWikiTiddlerSelect}
        onRemoveWikiTiddler={handleRemoveWikiTiddler}
      />

      {/* Model parameter dialog */}
      {parametersOpen && (
        <AIModelParametersDialog
          open={parametersOpen}
          onClose={() => {
            setParametersOpen(false);
          }}
          config={{
            api: agent?.aiApiConfig?.api || { provider: 'openai', model: 'gpt-3.5-turbo' },
            modelParameters: agent?.aiApiConfig?.modelParameters || {
              temperature: 0.7,
              maxTokens: 1000,
              topP: 0.95,
              systemPrompt: '',
            },
          }}
          onSave={async (newConfig) => {
            if (agent && tab.agentId) {
              await updateAgent({
                aiApiConfig: newConfig,
              });
              setParametersOpen(false);
            }
          }}
        />
      )}
    </Box>
  );
};
