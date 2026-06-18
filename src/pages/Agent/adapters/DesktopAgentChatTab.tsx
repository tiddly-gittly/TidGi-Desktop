/**
 * DesktopAgentChatTab — Desktop-specific chat tab adapter.
 *
 * Bridges the Desktop Zustand store (useAgentChatStore) with the shared
 * AgentChatView from @memeloop/react-ui/agent.
 *
 * Desktop-specific responsibilities:
 * - Agent loading/subscription lifecycle via tab.agentId
 * - Wiki tiddler selector integration
 * - Model parameters dialog
 * - Agent switching with tab data updates
 * - Wiki tiddler click navigation
 * - Split view handling
 */

import { Box, Typography } from '@mui/material';
import type { ChatMessage, WikiTiddlerClickData } from 'memeloop';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { WikiChannel } from '@/constants/channels';
import { AIModelParametersDialog } from '@/windows/Preferences/sections/ExternalAPI/components/AIModelParametersDialog';
import { AgentChatView } from '@memeloop/react-ui/agent';
import { type MemeLoopChatAdapter, useAui } from '@memeloop/react-ui/chat';

import { ChatHeader } from './components/ChatHeader';
import { WikiTiddlerSelector } from './components/WikiTiddlerSelector';
import { useMessageHandling } from './hooks/useMessageHandling';
import { isChatTab } from './utils/tabTypeGuards';

import { useAgentChatStore } from '../store/agentChatStore';
import { useTabStore } from '../store/tabStore';
import type { TabItem } from '../types/tab';

interface DesktopAgentChatTabProps {
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
 * Desktop Agent Chat Tab Component
 * Displays a chat interface for interacting with an AI agent.
 */
export const DesktopAgentChatTab: React.FC<DesktopAgentChatTabProps> = ({ tab, isSplitView }) => {
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
    updateMessage,
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
      updateMessage: state.updateMessage,
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

  // Fetch agent and subscribe on tab/agent change.
  useEffect(() => {
    if (!tab.agentId) return;

    void window.service.native.log('info', 'DesktopAgentChatTab: Setting up agent subscription', {
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
      resolveAskQuestion: async (questionId, answer) => {
        if (agent?.id) {
          await window.service.agentInstance.resolveAskQuestion(agent.id, questionId, answer);
        }
      },
      updateMessage: async (message) => {
        updateMessage(message);
        if (agent?.id) {
          await window.service.agentInstance.debounceUpdateMessage(message, agent.id, 0);
        }
      },
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
      agent?.id,
      updateMessage,
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

  const renderAttachmentActions = (
    <WikiTiddlerSelector
      disabled={!agent || isWorking}
      onSelect={(tiddler) => {
        handleWikiTiddlerSelect(tiddler);
      }}
    />
  );

  /**
   * Handle click on a wiki tiddler chip inside a chat message.
   * Opens the tiddler in the wiki view or navigates to the workspace.
   */
  const handleWikiTiddlerClick = useCallback(
    (tiddler: WikiTiddlerClickData) => {
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

  return (
    <AgentChatView
      adapter={adapter}
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
      renderAttachmentActions={renderAttachmentActions}
      selectedFile={selectedFile}
      selectedWikiTiddlers={selectedWikiTiddlers}
      onFileSelect={handleFileSelect}
      onWikiTiddlerSelect={handleWikiTiddlerSelect}
      onClearFile={handleClearFile}
      onRemoveWikiTiddler={handleRemoveWikiTiddler}
      onWikiTiddlerClick={handleWikiTiddlerClick}
      disabled={!agent || isWorking}
      placeholder={t('Agent.StartConversation')}
      loadingMessage={t('Agent.LoadingChat')}
      emptyMessage={t('Agent.StartConversation')}
      footer={parametersOpen && (
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
    />
  );
};
