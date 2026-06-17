// Chat tab content component - built on @memeloop/react-ui + assistant-ui

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CopyAllIcon from '@mui/icons-material/CopyAll';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import type { ChatMessage } from 'memeloop';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { WikiChannel } from '@/constants/channels';
import { type MemeLoopChatAdapter, MemeLoopComposer, MemeLoopRuntimeProvider, MemeLoopThread, useAui } from '@memeloop/react-ui/chat';

import { ChatHeader } from './components/ChatHeader';
import { MessageRenderer } from './components/MessageRenderer';
import { WikiTiddlerSelector } from './components/WikiTiddlerSelector';
import { useMessageHandling } from './hooks/useMessageHandling';
import { useRegisterMessageRenderers } from './hooks/useMessageRendering';
import { isChatTab } from './utils/tabTypeGuards';

import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore';
import { useTabStore } from '@/pages/Agent/store/tabStore';
import { AIModelParametersDialog } from '@/windows/Preferences/sections/ExternalAPI/components/AIModelParametersDialog';
import { TabItem } from '../Agent/types/tab';

interface ChatTabContentProps {
  tab: TabItem;
  isSplitView?: boolean;
}

/**
 * Wraps ChatHeader so it can read the current composer text from the assistant-ui
 * runtime for prompt preview.
 */
function HeaderWithComposerText(props: React.ComponentProps<typeof ChatHeader>) {
  const aui = useAui();
  const text = aui.composer().getState().text;
  return <ChatHeader {...props} inputText={text} />;
}

/**
 * Chat Tab Content Component
 * Displays a chat interface for interacting with an AI agent.
 */
export const ChatTabContent: React.FC<ChatTabContentProps> = ({ tab, isSplitView }) => {
  const { t } = useTranslation('agent');

  if (!isChatTab(tab)) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography color='error'>{t('Agent.InvalidTabType')}</Typography>
      </Box>
    );
  }

  const {
    fetchAgent,
    cancelAgent,
    subscribeToUpdates,
    updateAgent,
    loading,
    error,
    agent,
    messages,
    orderedMessageIds,
    streamingMessageIds,
    sendMessage: storeSendMessage,
    deleteTurn,
    retryTurn,
  } = useAgentChatStore(
    useShallow((state) => ({
      fetchAgent: state.fetchAgent,
      cancelAgent: state.cancelAgent,
      subscribeToUpdates: state.subscribeToUpdates,
      updateAgent: state.updateAgent,
      loading: state.loading,
      error: state.error,
      agent: state.agent,
      messages: state.messages,
      orderedMessageIds: state.orderedMessageIds,
      streamingMessageIds: state.streamingMessageIds,
      sendMessage: state.sendMessage,
      deleteTurn: state.deleteTurn,
      retryTurn: state.retryTurn,
    })),
  );

  const {
    parametersOpen,
    setParametersOpen,
    handleOpenParameters,
    selectedFile,
    handleFileSelect,
    handleClearFile,
    selectedWikiTiddlers,
    handleWikiTiddlerSelect,
    handleRemoveWikiTiddler,
    clearAttachments,
  } = useMessageHandling();

  useRegisterMessageRenderers();

  // Fetch agent and subscribe on tab/agent change.
  useEffect(() => {
    if (!tab.agentId) return;

    void window.service.native.log('info', 'ChatTabContent: Setting up agent subscription', {
      agentId: tab.agentId,
      tabId: tab.id,
      tabTitle: tab.title,
    });

    void fetchAgent(tab.agentId);
    const unsub = subscribeToUpdates(tab.agentId);
    return () => {
      if (unsub) unsub();
    };
  }, [tab.agentId, fetchAgent, subscribeToUpdates]);

  const orderedMessages = useMemo(
    () =>
      orderedMessageIds
        .map((id) => messages.get(id))
        .filter((message): message is ChatMessage => message !== undefined),
    [messages, orderedMessageIds],
  );

  const isWorking = loading || agent?.status?.state === 'working';
  const isStreaming = streamingMessageIds.size > 0;

  const adapter: MemeLoopChatAdapter = useMemo(
    () => ({
      messages: orderedMessages,
      isRunning: isWorking,
      isLoading: loading,
      isMessageStreaming: (messageId) => streamingMessageIds.has(messageId),
      error,
      sendMessage: async ({ text, file, wikiTiddlers }) => {
        await storeSendMessage(text, file, wikiTiddlers);
        clearAttachments();
      },
      cancel: cancelAgent,
      deleteTurn: async (userMessageId) => {
        await deleteTurn(userMessageId);
      },
      retryTurn,
    }),
    [
      orderedMessages,
      isWorking,
      loading,
      streamingMessageIds,
      error,
      storeSendMessage,
      clearAttachments,
      cancelAgent,
      deleteTurn,
      retryTurn,
    ],
  );

  const updateTabData = useTabStore(useShallow((state) => state.updateTabData));
  const handleSwitchAgent = React.useCallback(
    async (newAgentDefinitionId: string) => {
      if (newAgentDefinitionId === tab.agentDefId) return;
      try {
        const newAgent = await window.service.agentInstance.createAgent(newAgentDefinitionId);
        updateTabData(tab.id, {
          agentId: newAgent.id,
          agentDefId: newAgentDefinitionId,
          title: newAgent.name,
        });
        await fetchAgent(newAgent.id);
      } catch (error_) {
        void window.service.native.log('error', 'Failed to switch agent', { error: error_ });
      }
    },
    [tab.agentDefId, tab.id, updateTabData, fetchAgent],
  );

  const renderMessageContent = React.useCallback(
    (message: ChatMessage, isUser: boolean) => <MessageRenderer message={message} isUser={isUser} />,
    [],
  );

  /**
   * Render turn action buttons below assistant messages.
   * Uses the store to find the user message that starts the current turn,
   * then provides retry / delete / copy actions.
   */
  const renderTurnActions = useCallback(
    (message: ChatMessage) => {
      if (message.role === 'user') return null;

      // Find the user message that starts this turn — the nearest preceding user message.
      const currentIndex = orderedMessageIds.indexOf(message.messageId);
      if (currentIndex < 0) return null;
      const precedingUserMessageIds = orderedMessageIds
        .slice(0, currentIndex)
        .filter((id) => messages.get(id)?.role === 'user');
      const userMessageId = precedingUserMessageIds.length > 0
        ? precedingUserMessageIds[precedingUserMessageIds.length - 1]
        : undefined;
      if (!userMessageId) return null;

      const handleRetry = () => retryTurn(userMessageId);
      const handleDelete = () => deleteTurn(userMessageId);

      const handleCopy = () => {
        // Copy this turn's assistant messages to clipboard.
        const fromIndex = currentIndex;
        const toIndex = orderedMessageIds.findIndex((id, index) => index > currentIndex && messages.get(id)?.role === 'user');
        const rangeIds = toIndex >= 0 ? orderedMessageIds.slice(fromIndex, toIndex) : orderedMessageIds.slice(fromIndex);
        const text = rangeIds
          .map((id) => messages.get(id)?.content ?? '')
          .filter(Boolean)
          .join('\n\n');
        if (text) void navigator.clipboard.writeText(text);
      };

      const handleCopyAll = () => {
        const allText = orderedMessageIds
          .map((id) => {
            const message_ = messages.get(id);
            if (!message_) return '';
            const role = message_.role === 'user' ? 'User' : 'Agent';
            const content = message_.content || '';
            return content ? `${role}: ${content}` : '';
          })
          .filter(Boolean)
          .join('\n\n');
        if (allText) void navigator.clipboard.writeText(allText);
      };

      const isAgentMessage = message.role === 'assistant';

      return (
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            mt: 0.5,
            opacity: 0.15,
            transition: 'opacity 0.15s',
            '&:hover': { opacity: 1 },
            '.turn-group:hover &': { opacity: 1 },
          }}
        >
          {isAgentMessage && (
            <>
              <Tooltip title='Retry'>
                <IconButton size='small' onClick={handleRetry}>
                  <ReplayIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title='Delete turn'>
                <IconButton size='small' onClick={handleDelete}>
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Tooltip title='Copy'>
            <IconButton size='small' onClick={handleCopy}>
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title='Copy all'>
            <IconButton size='small' onClick={handleCopyAll}>
              <CopyAllIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      );
    },
    [orderedMessageIds, messages, retryTurn, deleteTurn],
  );

  const renderAttachmentActions = (
    <WikiTiddlerSelector
      disabled={!agent || isWorking}
      onSelect={(tiddler) => {
        handleWikiTiddlerSelect(tiddler);
      }}
    />
  );

  const composer = (
    <MemeLoopComposer
      selectedFile={selectedFile}
      selectedWikiTiddlers={selectedWikiTiddlers}
      onFileSelect={handleFileSelect}
      onWikiTiddlerSelect={handleWikiTiddlerSelect}
      onClearFile={handleClearFile}
      onRemoveWikiTiddler={handleRemoveWikiTiddler}
      renderAttachmentActions={renderAttachmentActions}
      disabled={!agent || isWorking}
      placeholder={t('Agent.StartConversation')}
    />
  );

  /** Local type mirroring WikiTiddlerClickData for eslint type resolution. */
  interface WikiTiddlerClickInfo {
    workspaceId: string;
    workspaceName: string;
    tiddlerTitle: string;
    renderedContent?: string;
  }

  /**
   * Handle click on a wiki tiddler chip inside a chat message.
   * Opens the tiddler in the wiki view or navigates to the workspace.
   */
  const handleWikiTiddlerClick = useCallback(
    (tiddler: WikiTiddlerClickInfo) => {
      void (async () => {
        try {
          if (isSplitView) {
            await window.service.wiki.wikiOperationInBrowser(WikiChannel.openTiddler, tiddler.workspaceId, [
              tiddler.tiddlerTitle,
            ]);
          } else {
            await window.service.workspaceView.setActiveWorkspaceView(tiddler.workspaceId);
          }
          void window.service.native.log('debug', 'Navigated to wiki tiddler', {
            workspaceId: tiddler.workspaceId,
            workspaceName: tiddler.workspaceName,
            tiddlerTitle: tiddler.tiddlerTitle,
            isSplitView,
          });
        } catch (error) {
          void window.service.native.log('error', 'Failed to navigate to wiki tiddler', {
            error,
            workspaceId: tiddler.workspaceId,
            tiddlerTitle: tiddler.tiddlerTitle,
          });
        }
      })();
    },
    [isSplitView],
  );

  const empty = (
    <>
      {!loading && !error && orderedMessageIds.length === 0 && (
        <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
          <Typography>{t('Agent.StartConversation')}</Typography>
        </Box>
      )}
      {loading && orderedMessageIds.length === 0 && (
        <Box sx={{ textAlign: 'center', p: 4 }}>
          <CircularProgress size={24} />
          <Typography sx={{ mt: 2 }}>{t('Agent.LoadingChat')}</Typography>
        </Box>
      )}
      {error && (
        <Box sx={{ textAlign: 'center', p: 2, color: 'error.main' }}>
          <Typography>{error.message}</Typography>
        </Box>
      )}
    </>
  );

  return (
    <MemeLoopRuntimeProvider adapter={adapter}>
      <MemeLoopThread
        header={
          <HeaderWithComposerText
            title={tab.title}
            onOpenParameters={handleOpenParameters}
            loading={isWorking}
            currentAgentDefId={tab.agentDefId}
            onSwitchAgent={handleSwitchAgent}
            isStreaming={isStreaming}
            isSplitView={isSplitView}
          />
        }
        empty={empty}
        composerComponent={() => composer}
        renderMessageContent={renderMessageContent}
        renderTurnActions={renderTurnActions}
        onWikiTiddlerClick={handleWikiTiddlerClick}
      />

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
    </MemeLoopRuntimeProvider>
  );
};
