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

import { Box, Button, Typography } from '@mui/material';
import type { ChatMessage, WikiTiddlerClickData } from 'memeloop';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { WikiChannel } from '@/constants/channels';
import { getConfigErrorPresentation } from '@/services/externalAPI/configErrorPresentation';
import { PreferenceSections } from '@/services/preferences/interface';
import { AIModelParametersDialog } from '@/windows/Preferences/sections/ExternalAPI/components/AIModelParametersDialog';
import { AgentChatView } from '@memeloop/react-ui/agent';
import { type MemeLoopChatAdapter, MessageContent } from '@memeloop/react-ui/chat';

import { ChatHeader } from './components/ChatHeader';
import { ChatToolbar } from './components/ChatToolbar';
import { E2EComposer } from './components/E2EComposer';
import { WikiTiddlerSelector } from './components/WikiTiddlerSelector';
import { useExecutionTargets } from './hooks/useExecutionTargets';
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
 * Renders a configuration error inside a message or empty state.
 * Detects the raw i18n key prefix `Chat.ConfigError.<Key>` and translates it.
 */
export function ConfigErrorMessage({
  fallbackMessage,
  translationKey,
  params,
}: {
  fallbackMessage: string;
  translationKey: string;
  params: Record<string, string>;
}) {
  const { t } = useTranslation('agent');

  const openExternalAPISettings = async (): Promise<void> => {
    try {
      const isTestMode = await window.service.context.get('isTest');
      const scheme = isTestMode ? 'tidgi-test' : 'tidgi';
      await window.service.deepLink.openDeepLink(`${scheme}://preferences/${PreferenceSections.externalAPI}`);
    } catch (error) {
      void window.service.native.log('error', 'Failed to open External API settings', {
        error,
        function: 'ConfigErrorMessage.openExternalAPISettings',
      });
    }
  };

  return (
    <Box data-testid='error-message' sx={{ textAlign: 'center', p: 2 }}>
      <Typography color='error.main' variant='h6' gutterBottom>
        {t('Chat.ConfigError.Title')}
      </Typography>
      <Typography color='text.secondary' sx={{ mb: 1.5 }}>
        {t(`Chat.ConfigError.${translationKey}`, { defaultValue: fallbackMessage, ...params })}
      </Typography>
      <Button
        variant='outlined'
        size='small'
        onClick={() => {
          void openExternalAPISettings();
        }}
      >
        {t('Chat.ConfigError.GoToSettings')}
      </Button>
    </Box>
  );
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

  const isWorking = loading;
  const isStreaming = streamingMessageIds.size > 0;

  const {
    activeExecutionTargetId,
    cancelSelectedTarget,
    executionTargets,
    loadMessageDetail,
    remoteError,
    remoteRunning,
    sendMessage: sendToExecutionTarget,
    setExecutionTarget,
  } = useExecutionTargets({
    agent,
    cancelLocalAgent: cancelAgent,
    deleteTurn,
    fetchAgent,
    orderedMessages,
    sendLocalMessage: storeSendMessage,
    tabTitle: tab.title,
  });

  const adapter: MemeLoopChatAdapter = useMemo(
    () => ({
      messages: orderedMessages,
      isRunning: isWorking || remoteRunning,
      isLoading: loading,
      isMessageStreaming: (messageId) => streamingMessageIds.has(messageId),
      error: error ?? remoteError,
      executionTargets,
      activeExecutionTargetId,
      setExecutionTarget,
      loadMessageDetail,
      sendMessage: async ({ text, file, wikiTiddlers }) => {
        await sendToExecutionTarget(text, file, wikiTiddlers);
        clearAttachments();
      },
      cancel: cancelSelectedTarget,
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
      remoteRunning,
      loading,
      streamingMessageIds,
      error,
      remoteError,
      executionTargets,
      activeExecutionTargetId,
      setExecutionTarget,
      loadMessageDetail,
      sendToExecutionTarget,
      clearAttachments,
      cancelSelectedTarget,
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

  const renderAttachmentPicker: NonNullable<React.ComponentProps<typeof AgentChatView>['renderAttachmentPicker']> = ({ disabled, openFilePicker }) => (
    <WikiTiddlerSelector
      disabled={disabled}
      onAddImage={openFilePicker}
      onSelect={handleWikiTiddlerSelect}
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
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', minHeight: 0 }}>
      <AgentChatView
        adapter={adapter}
        header={<ChatHeader title={tab.title} isSplitView={isSplitView} />}
        composerToolbar={
          <ChatToolbar
            tabId={tab.id}
            currentAgentDefId={tab.agentDefId}
            onSwitchAgent={handleSwitchAgent}
            onOpenParameters={handleOpenParameters}
            loading={isWorking}
            isStreaming={isStreaming}
            isSplitView={isSplitView}
            embedded
          />
        }
        renderAttachmentPicker={renderAttachmentPicker}
        selectedFile={selectedFile}
        selectedWikiTiddlers={selectedWikiTiddlers}
        onFileSelect={handleFileSelect}
        onWikiTiddlerSelect={handleWikiTiddlerSelect}
        onClearFile={handleClearFile}
        onRemoveWikiTiddler={handleRemoveWikiTiddler}
        onWikiTiddlerClick={handleWikiTiddlerClick}
        composerComponent={E2EComposer}
        disabled={!agent || isWorking}
        placeholder={t('Agent.StartConversation')}
        loadingMessage={t('Agent.LoadingChat')}
        emptyMessage={t('Agent.StartConversation')}
        renderError={(error_) => {
          const presentation = getConfigErrorPresentation(error_.message, error_);
          if (!presentation) {
            return (
              <Box data-testid='error-message' sx={{ textAlign: 'center', p: 2, color: 'error.main' }}>
                <Typography>{error_.message}</Typography>
              </Box>
            );
          }
          return (
            <ConfigErrorMessage
              fallbackMessage={presentation.fallbackMessage}
              params={presentation.params}
              translationKey={presentation.key}
            />
          );
        }}
        renderMessageContent={(message, _isUser) => {
          // Render known config errors (raw i18n key prefix) as a rich card
          // regardless of their role. Some error paths store them as role='error',
          // others may fall back to role='assistant'; the key is the reliable signal.
          if (message.role !== 'error' && !message.content.startsWith('Chat.ConfigError.')) {
            return <MessageContent message={message} />;
          }

          const errorDetail = message.metadata?.errorDetail;
          const typedErrorDetail = (typeof errorDetail === 'object' && errorDetail !== null
            ? errorDetail
            : {}) as Record<string, unknown>;
          const presentation = getConfigErrorPresentation(message.content, typedErrorDetail);
          if (!presentation) {
            return <MessageContent message={message} />;
          }
          return (
            <ConfigErrorMessage
              fallbackMessage={presentation.fallbackMessage}
              params={presentation.params}
              translationKey={presentation.key}
            />
          );
        }}
      />
      <AIModelParametersDialog
        open={parametersOpen}
        onClose={() => {
          setParametersOpen(false);
        }}
        config={{
          default: agent?.aiApiConfig?.default || { provider: 'openai', model: 'gpt-3.5-turbo' },
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
    </Box>
  );
};
