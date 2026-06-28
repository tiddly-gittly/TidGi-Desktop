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
import { isProviderConfigError } from '@/services/externalAPI/errors';
import { PreferenceSections } from '@/services/preferences/interface';
import { AIModelParametersDialog } from '@/windows/Preferences/sections/ExternalAPI/components/AIModelParametersDialog';
import { AgentChatView } from '@memeloop/react-ui/agent';
import { type MemeLoopChatAdapter, useAui } from '@memeloop/react-ui/chat';

import { E2EComposer } from './components/E2EComposer';
import { ChatHeader } from './components/ChatHeader';
import { WikiTiddlerSelector } from './components/WikiTiddlerSelector';
import { useMessageHandling } from './hooks/useMessageHandling';
import { isChatTab } from './utils/tabTypeGuards';

import { useAgentChatStore } from '../store/agentChatStore';
import { useTabStore } from '../store/tabStore';
import type { TabItem } from '../types/tab';

const LOCAL_EXECUTION_TARGET_ID = 'local';
const REMOTE_EXECUTION_TARGET_PREFIX = 'peer:';

interface AgentExecutionTarget {
  id: string;
  label: string;
  description?: string;
  kind?: 'local' | 'remote';
  disabled?: boolean;
}

interface SetExecutionTargetOptions {
  restartCurrentTurn?: boolean;
}

function remoteExecutionTargetId(peerId: string): string {
  return `${REMOTE_EXECUTION_TARGET_PREFIX}${peerId}`;
}

function peerIdFromExecutionTarget(targetId: string): string | undefined {
  return targetId.startsWith(REMOTE_EXECUTION_TARGET_PREFIX) ? targetId.slice(REMOTE_EXECUTION_TARGET_PREFIX.length) : undefined;
}

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
  const [localPeerId, setLocalPeerId] = React.useState<string | undefined>();
  const [agentLoopDevices, setAgentLoopDevices] = React.useState<import('memeloop').Device[]>([]);
  const [activeExecutionTargetId, setActiveExecutionTargetId] = React.useState(LOCAL_EXECUTION_TARGET_ID);
  const [remoteRunning, setRemoteRunning] = React.useState(false);
  const [remoteError, setRemoteError] = React.useState<Error | null>(null);

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

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        await window.service.deviceNetwork.start();
        const [local, devices] = await Promise.all([
          window.service.deviceNetwork.getLocalDevice(),
          window.service.deviceNetwork.listDevices(),
        ]);
        if (disposed) return;
        setLocalPeerId(local.peerId);
        setAgentLoopDevices(devices.filter(device => device.peerId !== local.peerId && device.trusted && device.capabilities.agentLoop));
        const subscription = window.observables.deviceNetwork.devices$.subscribe((nextDevices) => {
          setAgentLoopDevices(nextDevices.filter(device => device.peerId !== local.peerId && device.trusted && device.capabilities.agentLoop));
        });
        unsubscribe = () => subscription.unsubscribe();
      } catch (error_) {
        setRemoteError(error_ instanceof Error ? error_ : new Error(String(error_)));
      }
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const executionTargets = useMemo<AgentExecutionTarget[]>(() => [
    {
      id: LOCAL_EXECUTION_TARGET_ID,
      label: 'This device',
      description: localPeerId ? `Run on this Desktop (${localPeerId})` : 'Run on this Desktop',
      kind: 'local',
    },
    ...agentLoopDevices.map(device => ({
      id: remoteExecutionTargetId(device.peerId),
      label: device.displayName,
      description: `${device.platform} · ${device.reachability.state}`,
      kind: 'remote' as const,
      disabled: !device.trusted,
    })),
  ], [agentLoopDevices, localPeerId]);

  const sendRemoteMessage = useCallback(async (peerId: string, text: string) => {
    if (!agent?.id) throw new Error('No active agent in store');
    setRemoteRunning(true);
    setRemoteError(null);
    try {
      await window.service.deviceNetwork.sendRpc(peerId, 'memeloop.agent.runTurn', {
        conversationId: agent.id,
        definitionId: agent.agentDefId,
        message: text,
        resumeSession: orderedMessages,
        conversation: {
          conversationId: agent.id,
          title: agent.name || tab.title,
          lastMessagePreview: text,
          lastMessageTimestamp: Date.now(),
          messageCount: orderedMessages.length,
          originNodeId: localPeerId ?? 'tidgi-desktop',
          definitionId: agent.agentDefId,
          isUserInitiated: true,
        },
      });
      await window.service.deviceNetwork.syncWithDevice(peerId);
      await fetchAgent(agent.id);
    } catch (error_) {
      const nextError = error_ instanceof Error ? error_ : new Error(String(error_));
      setRemoteError(nextError);
      throw nextError;
    } finally {
      setRemoteRunning(false);
    }
  }, [agent?.agentDefId, agent?.id, agent?.name, fetchAgent, localPeerId, orderedMessages, tab.title]);

  const cancelSelectedTarget = useCallback(async () => {
    const peerId = peerIdFromExecutionTarget(activeExecutionTargetId);
    if (peerId && agent?.id) {
      await window.service.deviceNetwork.sendRpc(peerId, 'memeloop.agent.cancel', { conversationId: agent.id }).catch((error_: unknown) => {
        void window.service.native.log('warn', 'Remote agent cancel failed', { peerId, error: error_ });
      });
      setRemoteRunning(false);
      return;
    }
    await cancelAgent();
  }, [activeExecutionTargetId, agent?.id, cancelAgent]);

  const setExecutionTarget = useCallback(async (targetId: string, options?: SetExecutionTargetOptions) => {
    if (targetId === activeExecutionTargetId) return;
    if (!options?.restartCurrentTurn) {
      setActiveExecutionTargetId(targetId);
      return;
    }

    const lastUserMessage = [...orderedMessages].reverse().find(message => message.role === 'user');
    await cancelSelectedTarget();
    setActiveExecutionTargetId(targetId);
    if (!lastUserMessage) return;
    await deleteTurn(lastUserMessage.messageId);
    const peerId = peerIdFromExecutionTarget(targetId);
    if (peerId) {
      await sendRemoteMessage(peerId, lastUserMessage.content);
      return;
    }
    await storeSendMessage(lastUserMessage.content);
  }, [activeExecutionTargetId, cancelSelectedTarget, deleteTurn, orderedMessages, sendRemoteMessage, storeSendMessage]);

  const loadMessageDetail = useCallback(async (message: ChatMessage) => {
    if (!message.detailRef) return null;
    const targetPeerId = message.detailRef.nodeId;
    const targetConversationId = message.detailRef.conversationId ?? message.conversationId;
    if (!targetPeerId || targetPeerId === localPeerId) {
      return orderedMessages.filter(item => item.conversationId === targetConversationId);
    }
    const result = await window.service.deviceNetwork.sendRpc<{ messages: ChatMessage[] }>(targetPeerId, 'memeloop.chat.pullAgentRunLog', {
      conversationId: targetConversationId,
      knownMessageIds: orderedMessages.map(item => item.messageId),
    });
    await window.service.deviceNetwork.syncWithDevice(targetPeerId).catch((error_: unknown) => {
      void window.service.native.log('warn', 'DetailRef follow-up sync failed', { peerId: targetPeerId, error: error_ });
    });
    if (agent?.id) await fetchAgent(agent.id);
    return result.messages;
  }, [agent?.id, fetchAgent, localPeerId, orderedMessages]);

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
        const peerId = peerIdFromExecutionTarget(activeExecutionTargetId);
        if (peerId) {
          await sendRemoteMessage(peerId, text);
        } else {
          await storeSendMessage(text, file, wikiTiddlers);
        }
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
      storeSendMessage,
      sendRemoteMessage,
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
      composerComponent={E2EComposer}
      disabled={!agent || isWorking}
      placeholder={t('Agent.StartConversation')}
      loadingMessage={t('Agent.LoadingChat')}
      emptyMessage={t('Agent.StartConversation')}
      renderError={(error_) => {
        const isConfigError = isProviderConfigError(error_) || error_.name === 'MissingConfigError';
        if (!isConfigError) {
          return (
            <Box data-testid='error-message' sx={{ textAlign: 'center', p: 2, color: 'error.main' }}>
              <Typography>{error_.message}</Typography>
            </Box>
          );
        }

        return (
          <Box data-testid='error-message' sx={{ textAlign: 'center', p: 2 }}>
            <Typography color='error.main' variant='h6' gutterBottom>
              {t('ConfigError.Title')}
            </Typography>
            <Typography color='text.secondary' sx={{ mb: 1.5 }}>
              {t(`ConfigError.${error_.name}`, { defaultValue: error_.message })}
            </Typography>
            <Button
              variant='outlined'
              size='small'
              onClick={async () => {
                const isTestMode = await window.service.context.get('isTest');
                const scheme = isTestMode ? 'tidgi-test' : 'tidgi';
                await window.service.deepLink.openDeepLink(`${scheme}://preferences/${PreferenceSections.externalAPI}`);
              }}
            >
              {t('ConfigError.GoToSettings')}
            </Button>
          </Box>
        );
      }}
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
