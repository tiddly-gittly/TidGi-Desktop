import { WikiChannel } from '@/constants/channels';
import { TabListDropdown } from '@/pages/Agent/components/TabBar/TabListDropdown';
import { useTabStore } from '@/pages/Agent/store/tabStore';
import type { IChatTab, TabItem } from '@/pages/Agent/types/tab';
import { PreferenceSections } from '@/services/preferences/interface';
import { parseTiddlyWikiDrop } from '@/services/wiki/plugin/memeloopAgentUI/dropPayload';
import {
  AgentChatConfigError,
  type AgentChatErrorPresentation,
  AgentChatShell,
  AgentSessionProvider,
  useAgentSession,
  useAgentSessionChatAdapter,
  type WikiAttachmentOption,
} from '@memeloop/react-ui/agent';
import { ConversationTimelineWindowController, type WebMemeLoopChatAdapter } from '@memeloop/react-ui/chat';
import TuneIcon from '@mui/icons-material/Tune';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { AgentSessionController, type ChatMessage, extractAgentRunError, type WikiTiddlerClickData } from 'memeloop';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { AgentSwitcher } from './components/AgentSwitcher';
import { CompactModelSelector } from './components/CompactModelSelector';
import { PromptPreviewButtonWithMenu } from './components/PromptPreviewButtonWithMenu';
import { createDesktopAgentConversationClient } from './DesktopAgentConversationClient';
import { createDesktopFileAttachmentSource } from './DesktopAgentExecutionCoordinator';
import { createDesktopAgentInstanceClient } from './DesktopAgentInstanceClient';
import { createDesktopConversationTimelineClient } from './DesktopConversationTimelineClient';
import { createDesktopMessageDetailLoader } from './DesktopMessageDetailLoader';
import { createDesktopPromptPreviewController } from './DesktopPromptPreviewController';
import { useExecutionTargets } from './hooks/useExecutionTargets';
import { useMessageHandling } from './hooks/useMessageHandling';
import { localizeAgentRunError } from './localizeAgentRunError';
import { isChatTab } from './utils/tabTypeGuards';

interface DesktopAgentChatTabProps {
  tab: TabItem;
  isSplitView?: boolean;
}

const createId = (): string => crypto.randomUUID();

function dataIsTiddlerArray(value: unknown): value is Array<{ title?: string }> {
  return Array.isArray(value);
}

async function loadWikiAttachmentOptions(signal: AbortSignal): Promise<readonly WikiAttachmentOption[]> {
  signal.throwIfAborted();
  const workspaces = await window.service.workspace.getWorkspacesAsList();
  signal.throwIfAborted();
  const options: WikiAttachmentOption[] = [];
  for (const workspace of workspaces) {
    signal.throwIfAborted();
    if (!('wikiFolderLocation' in workspace) || workspace.hibernated) continue;
    const response = await window.service.wiki.callWikiIpcServerRoute(
      workspace.id,
      'getTiddlersJSON',
      '[!is[system]sort[title]limit[200]]',
      ['text'],
    ).catch(() => undefined);
    signal.throwIfAborted();
    if (response?.statusCode !== 200 || !dataIsTiddlerArray(response.data)) continue;
    for (const tiddler of response.data) {
      if (typeof tiddler.title !== 'string' || tiddler.title.length === 0) continue;
      options.push({
        id: `${workspace.id}:${tiddler.title}`,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        tiddlerTitle: tiddler.title,
      });
      if (options.length >= 200) return options;
    }
  }
  return options;
}

/** Kept as a small compatibility export for existing focused rendering tests. */
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
  return (
    <AgentChatConfigError
      title={t('Chat.ConfigError.Title')}
      message={t(`Chat.ConfigError.${translationKey}`, { defaultValue: fallbackMessage, ...params })}
      actionLabel={t('Chat.ConfigError.GoToSettings')}
      actionId='open-external-api-settings'
      onAction={openExternalApiSettings}
    />
  );
}

async function openExternalApiSettings(): Promise<void> {
  const isTestMode = await window.service.context.get('isTest');
  const scheme = isTestMode ? 'tidgi-test' : 'tidgi';
  await window.service.deepLink.openDeepLink(`${scheme}://preferences/${PreferenceSections.externalAPI}`);
}

type ActiveChatTab = IChatTab & { agentId: string };

function DesktopAgentChatSession({ tab, isSplitView }: { tab: ActiveChatTab; isSplitView?: boolean }) {
  const conversationClient = useMemo(createDesktopAgentConversationClient, []);
  const instanceClient = useMemo(createDesktopAgentInstanceClient, []);
  const timelineClient = useMemo(createDesktopConversationTimelineClient, []);
  const controller = useMemo(() =>
    new AgentSessionController({
      agentInstanceClient: instanceClient,
      conversationClient,
      maxResidentMessages: 50,
      maxResidentBytes: 256 * 1024,
    }), [conversationClient, instanceClient, tab.agentId]);
  const timelineController = useMemo(
    () => new ConversationTimelineWindowController(timelineClient),
    [tab.agentId, timelineClient],
  );

  useEffect(() => {
    void controller.start({ agentId: tab.agentId, conversationId: tab.agentId });
    return () => {
      controller.stop();
      timelineController.dispose();
    };
  }, [controller, tab.agentId, timelineController]);

  return (
    <AgentSessionProvider controller={controller}>
      <DesktopAgentChatView
        tab={tab}
        isSplitView={isSplitView}
        instanceClient={instanceClient}
        timelineController={timelineController}
      />
    </AgentSessionProvider>
  );
}

function DesktopAgentChatView({
  tab,
  isSplitView,
  instanceClient,
  timelineController,
}: {
  tab: ActiveChatTab;
  isSplitView?: boolean;
  instanceClient: ReturnType<typeof createDesktopAgentInstanceClient>;
  timelineController: ConversationTimelineWindowController;
}) {
  const { t, i18n } = useTranslation('agent');
  const { snapshot } = useAgentSession();
  const detailLoader = useMemo(createDesktopMessageDetailLoader, []);
  const promptPreviewController = useMemo(createDesktopPromptPreviewController, [tab.agentId]);
  const baseAdapter = useAgentSessionChatAdapter({
    conversationId: tab.agentId,
    timelineController,
    createId,
    loadMessageDetail: detailLoader,
    onError: (error, operation) => {
      void window.service.native.log('error', 'MemeLoop chat operation failed', { operation, error });
    },
  });
  const {
    selectedFile,
    handleFileSelect,
    handleClearFile,
    selectedWikiTiddlers,
    handleWikiTiddlerSelect,
    handleRemoveWikiTiddler,
    handleAttachmentsSelect,
    clearAttachments,
  } = useMessageHandling();

  const targets = useExecutionTargets({
    agent: snapshot.agent,
    orderedMessages: snapshot.messages,
  });
  const acknowledgeInitialMessage = useTabStore(useShallow(state => state.acknowledgeInitialMessage));
  const submittedInitialMessageReference = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!targets.isReady || !tab.initialMessage) return;
    const identity = `${tab.id}:${tab.agentId}`;
    if (submittedInitialMessageReference.current === identity) return;
    submittedInitialMessageReference.current = identity;
    const requestId = `initial:${tab.id}:${tab.agentId}:request`;
    const turnId = `initial:${tab.id}:${tab.agentId}:turn`;
    void targets.sendMessage(tab.initialMessage, undefined, tab.initialWikiTiddlers, {
      requestId,
      turnId,
      onAccepted: async () => {
        await acknowledgeInitialMessage(tab.id, tab.agentId, tab.initialMessage!);
      },
    }).catch((error: unknown) => {
      void window.service.native.log('error', 'Failed to submit pending initial MemeLoop message', {
        tabId: tab.id,
        agentId: tab.agentId,
        requestId,
        error,
      });
    });
  }, [acknowledgeInitialMessage, tab.agentId, tab.id, tab.initialMessage, tab.initialWikiTiddlers, targets.isReady, targets.sendMessage]);

  const adapter = useMemo((): WebMemeLoopChatAdapter => ({
    ...baseAdapter,
    executionTargets: targets.executionTargets,
    activeExecutionTargetId: targets.activeExecutionTargetId,
    setExecutionTarget: targets.setExecutionTarget,
    isRunning: targets.isRunning,
    error: targets.error ?? baseAdapter.error,
    cancel: targets.cancelSelectedTarget,
    sendMessage: async input => {
      const attachment = input.file ? createDesktopFileAttachmentSource(input.file) : undefined;
      await targets.sendMessage(input.text, attachment, input.wikiTiddlers);
      clearAttachments();
    },
    deleteTurn: targets.deleteTurn,
    retryTurn: targets.retryTurn,
  }), [baseAdapter, clearAttachments, targets]);

  const updateTabData = useTabStore(useShallow(state => state.updateTabData));
  const handleSwitchAgent = useCallback(async (agentDefinitionId: string) => {
    if (agentDefinitionId === tab.agentDefId) return;
    const newAgent = await instanceClient.createAgent(agentDefinitionId);
    updateTabData(tab.id, {
      agentId: newAgent.id,
      agentDefId: agentDefinitionId,
      title: agentDefinitionId,
    });
  }, [instanceClient, tab.agentDefId, tab.id, updateTabData]);

  const resolveErrorPresentation = useCallback((value: Error | ChatMessage): AgentChatErrorPresentation | null => {
    const runError = value instanceof Error
      ? extractAgentRunError(value)
      : extractAgentRunError(value.metadata?.agentRunError);
    if (!runError) return null;
    return {
      title: t('Chat.Message.Error'),
      message: localizeAgentRunError(runError, t),
      diagnosticId: runError.diagnosticId,
      settingTarget: runError.settingTarget,
      ...(runError.settingTarget === undefined
        ? {}
        : {
          actionLabel: t('Chat.ConfigError.GoToSettings'),
          actionId: 'open-agent-run-setting',
        }),
    };
  }, [t]);

  const handleWikiTiddlerClick = useCallback((tiddler: WikiTiddlerClickData) => {
    void (isSplitView
      ? window.service.wiki.wikiOperationInBrowser(WikiChannel.openTiddler, tiddler.workspaceId, [tiddler.tiddlerTitle])
      : window.service.workspaceView.setActiveWorkspaceView(tiddler.workspaceId));
  }, [isSplitView]);

  const resolveDroppedWikiTiddlers = useCallback(async (drop: Parameters<typeof parseTiddlyWikiDrop>[0]) => {
    const activeWorkspace = await window.service.workspace.getActiveWorkspace();
    return activeWorkspace ? parseTiddlyWikiDrop(drop, activeWorkspace.name) : [];
  }, []);
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
    [i18n.language],
  );
  const activeAgentDefinitionId = snapshot.agent?.agentDefId ?? tab.agentDefId ?? tab.agentId;

  return (
    <AgentChatShell
      adapter={adapter}
      header={{
        title: snapshot.agent?.name || tab.title,
        navigation: isSplitView ? undefined : <TabListDropdown />,
        editTitleLabel: t('Agent.EditTitle'),
        onTitleChange: async name => {
          await instanceClient.updateAgent(tab.agentId, { name });
        },
      }}
      toolbar={{
        primary: (
          <AgentSwitcher
            currentAgentDefId={activeAgentDefinitionId}
            onSwitch={agentDefinitionId => {
              void handleSwitchAgent(agentDefinitionId);
            }}
            disabled={adapter.isRunning}
          />
        ),
        secondary: (
          <>
            <CompactModelSelector agentId={tab.agentId} agentDefId={activeAgentDefinitionId} />
            <PromptPreviewButtonWithMenu
              tabId={tab.id}
              isSplitView={isSplitView}
              agentId={tab.agentId}
              agentDefinitionId={activeAgentDefinitionId}
              controller={promptPreviewController}
              disabled={adapter.isRunning}
            />
            <Tooltip title={t('Preference.ModelParameters')}>
              <IconButton size='small' onClick={() => void openExternalApiSettings()}>
                <TuneIcon />
              </IconButton>
            </Tooltip>
          </>
        ),
        loading: adapter.isLoading,
        status: snapshot.agent?.status.progress
          ? <Typography variant='caption' noWrap>{snapshot.agent.status.progress}</Typography>
          : undefined,
      }}
      attachmentSelector={{
        loadOptions: loadWikiAttachmentOptions,
        labels: {
          addAttachment: t('Agent.Attachment.AddAttachment'),
          addFile: t('Agent.Attachment.AddImage'),
          searchPlaceholder: t('Agent.Attachment.SearchPlaceholder'),
          noOptions: t('Agent.Attachment.NoOptions'),
        },
      }}
      resolveErrorPresentation={resolveErrorPresentation}
      genericErrorPresentation={{
        title: t('Chat.Message.Error'),
        message: t('Chat.GenericError'),
      }}
      onErrorAction={async presentation => {
        if (presentation.settingTarget) await openExternalApiSettings();
      }}
      selectedFile={selectedFile}
      selectedWikiTiddlers={selectedWikiTiddlers}
      onFileSelect={handleFileSelect}
      onWikiTiddlerSelect={handleWikiTiddlerSelect}
      onAttachmentsSelect={handleAttachmentsSelect}
      onClearFile={handleClearFile}
      onClearAttachments={clearAttachments}
      onRemoveWikiTiddler={handleRemoveWikiTiddler}
      resolveDroppedWikiTiddlers={resolveDroppedWikiTiddlers}
      onWikiTiddlerClick={handleWikiTiddlerClick}
      disabled={!snapshot.agent || adapter.isRunning}
      placeholder={t('Agent.StartConversation')}
      loadingMessage={t('Agent.LoadingChat')}
      emptyMessage={t('Agent.StartConversation')}
      operationErrorMessage={t('Chat.OperationError')}
      timelineLabels={{
        navigation: t('Chat.Timeline.Navigation'),
        turn: (index, total) => t('Chat.Timeline.Turn', { index, total }),
        compacted: count => t('Chat.Timeline.Compacted', { count }),
        loadEarlier: t('Chat.Timeline.LoadEarlier'),
        loadLater: t('Chat.Timeline.LoadLater'),
        seek: t('Chat.Timeline.Seek'),
        close: t('Chat.Timeline.Close'),
        newMessages: count => t('Chat.Timeline.NewMessages', { count }),
        moreResponses: count => t('Chat.Timeline.MoreResponses', { count }),
      }}
      formatTimelineTimestamp={timestamp => timeFormatter.format(new Date(timestamp))}
      actionLabels={{
        retry: t('Chat.Actions.Retry'),
        deleteTurn: t('Chat.Actions.DeleteTurn'),
        copy: t('Chat.Actions.Copy'),
        copyAll: t('Chat.Actions.CopyAll'),
        user: t('Chat.Actions.User'),
        agent: t('Chat.Actions.Agent'),
      }}
      composerLabels={{
        input: t('Chat.InputPlaceholder'),
        send: t('Chat.Send'),
        cancel: t('Chat.Cancel'),
        addFile: t('Agent.Attachment.AddImage'),
        removeFile: name => t('Chat.Attachment.RemoveFile', { name }),
        removeTiddler: (workspaceName, title) => t('Chat.Attachment.RemoveTiddler', { workspaceName, title }),
      }}
      messageLabels={{
        attachmentAlt: t('Chat.Message.AttachmentAlt'),
        noDetails: t('Chat.Message.NoDetails'),
        loadDetails: t('Chat.Message.LoadDetails'),
        hideDetails: t('Chat.Message.HideDetails'),
        showDetails: t('Chat.Message.ShowDetails'),
        error: t('Chat.Message.Error'),
        toolResult: t('Chat.Message.ToolResult'),
        toolCall: name => t('Chat.Message.ToolCall', { toolName: name }),
        truncated: count => t('Chat.Message.Truncated', { count }),
      }}
    />
  );
}

export const DesktopAgentChatTab: React.FC<DesktopAgentChatTabProps> = ({ tab, isSplitView }) => {
  const { t } = useTranslation('agent');
  if (!isChatTab(tab) || !tab.agentId) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography color='error'>{t('Agent.InvalidTabType')}</Typography>
      </Box>
    );
  }
  return <DesktopAgentChatSession tab={tab as ActiveChatTab} isSplitView={isSplitView} />;
};
