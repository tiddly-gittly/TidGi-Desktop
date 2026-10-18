import { WikiChannel } from '@/constants/channels';
import { TabListDropdown } from '@/pages/Agent/components/TabBar/TabListDropdown';
import { DesktopAgentSessionViewModel } from '@/pages/Agent/store/agentSessionViewModel';
import { useTabStore } from '@/pages/Agent/store/tabStore';
import type { IChatTab, TabItem } from '@/pages/Agent/types/tab';
import {
  type AgentChatErrorPresentation,
  AgentChatShell,
  AgentSessionProvider,
  useAgentSession,
  useAgentSessionChatAdapter,
  type WikiAttachmentOption,
} from '@memeloop/react-ui/agent';
import { ConversationTimelineWindowController, type MemeLoopMessageLabels, RenderedMessageContent, type WebMemeLoopChatAdapter } from '@memeloop/react-ui/chat';
import TuneIcon from '@mui/icons-material/Tune';
import { Alert, Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import type { TFunction } from 'i18next';
import { type ConversationMessageListProjection, extractAgentRunError, type WikiTiddlerClickData } from 'memeloop';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { AgentSwitcher } from './components/AgentSwitcher';
import { CompactModelSelector } from './components/CompactModelSelector';
import { PromptPreviewButtonWithMenu } from './components/PromptPreviewButtonWithMenu';
import { createSecureBrowserUuid } from './createSecureBrowserUuid';
import { createDesktopAgentConversationClient } from './DesktopAgentConversationClient';
import { createDesktopFileAttachmentSource } from './DesktopAgentExecutionCoordinator';
import { createDesktopAgentInstanceClient } from './DesktopAgentInstanceClient';
import { createDesktopConversationTimelineClient } from './DesktopConversationTimelineClient';
import { createDesktopMessageDetailLoader } from './DesktopMessageDetailLoader';
import { createDesktopMessageDetailViewModel } from './DesktopMessageDetailViewModel';
import { createDesktopMessageReasoningLoader } from './DesktopMessageReasoningLoader';
import { createDesktopVisibleAttachmentLoader } from './DesktopVisibleAttachmentLoader';
import { useConversationEditing } from './hooks/useConversationEditing';
import { useConversationWorkspace } from './hooks/useConversationWorkspace';
import { useExecutionTargets } from './hooks/useExecutionTargets';
import { useMessageHandling } from './hooks/useMessageHandling';
import { localizeAgentRunError } from './localizeAgentRunError';
import { handleDesktopAgentErrorAction, openAgentRunErrorSettings } from './openAgentRunErrorSettings';
import { parseTiddlyWikiDrop } from './tiddlyWikiDrop';
import { isChatTab } from './utils/tabTypeGuards';

interface DesktopAgentChatTabProps {
  tab: TabItem;
  isSplitView?: boolean;
}

const createId = createSecureBrowserUuid;

/** Keeps every shared message capability on the host locale instead of silently using Core's English defaults. */
export function createDesktopMessageLabels(t: TFunction<'agent'>): MemeLoopMessageLabels {
  return {
    attachmentAlt: t('Chat.Message.AttachmentAlt'),
    attachmentLoadFailed: t('Chat.Message.AttachmentLoadFailed'),
    noDetails: t('Chat.Message.NoDetails'),
    loadDetails: t('Chat.Message.LoadDetails'),
    reloadDetails: t('Chat.Message.ReloadDetails'),
    hideDetails: t('Chat.Message.HideDetails'),
    showDetails: t('Chat.Message.ShowDetails'),
    detailTruncated: t('Chat.Message.DetailTruncated'),
    detailLoadFailed: t('Chat.Message.DetailLoadFailed'),
    exportFullMessage: t('Chat.Message.ExportFullMessage'),
    reasoning: t('Chat.Message.Reasoning'),
    thinking: t('Chat.Message.Thinking'),
    showReasoning: t('Chat.Message.ShowReasoning'),
    hideReasoning: t('Chat.Message.HideReasoning'),
    loadMoreReasoning: t('Chat.Message.LoadMoreReasoning'),
    reasoningLoadFailed: t('Chat.Message.ReasoningLoadFailed'),
    error: t('Chat.Message.Error'),
    editing: {
      edit: t('Chat.Editing.Edit'),
      input: t('Chat.Editing.Input'),
      send: t('Chat.Send'),
      discard: t('Chat.Editing.Discard'),
      saveDraft: t('Chat.Editing.SaveDraft'),
      reloadDraft: t('Chat.Editing.ReloadDraft'),
      conflict: t('Chat.Editing.Conflict'),
      previousBranch: t('Chat.Editing.PreviousBranch'),
      nextBranch: t('Chat.Editing.NextBranch'),
    },
    toolResult: t('Chat.Message.ToolResult'),
    toolCall: name => t('Chat.Message.ToolCall', { toolName: name }),
    truncated: count => t('Chat.Message.Truncated', { count }),
    askQuestion: {
      answerPlaceholder: t('Chat.AskQuestion.AnswerPlaceholder'),
      submit: t('Chat.AskQuestion.Submit'),
      confirmSelection: t('Chat.AskQuestion.ConfirmSelection'),
      answered: t('Chat.AskQuestion.Answered'),
    },
  };
}

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

/** Host bridge used by the shared ask-question content renderer. */
export async function resolveDesktopAskQuestion(agentId: string, questionId: string, answer: string): Promise<void> {
  await window.service.agentInstance.resolveAskQuestion(agentId, questionId, answer);
}

type ActiveChatTab = IChatTab & { agentId: string };

function DesktopAgentChatSession({ tab, isSplitView }: { tab: ActiveChatTab; isSplitView?: boolean }) {
  const conversationClient = useMemo(createDesktopAgentConversationClient, []);
  const instanceClient = useMemo(createDesktopAgentInstanceClient, []);
  const timelineClient = useMemo(createDesktopConversationTimelineClient, []);
  const sessionViewModel = useMemo(() =>
    new DesktopAgentSessionViewModel({
      agentInstanceClient: instanceClient,
      conversationClient,
      timelineClient,
    }), [conversationClient, instanceClient, tab.agentId, timelineClient]);

  useEffect(() => {
    const release = sessionViewModel.acquire();
    void sessionViewModel.start({ agentId: tab.agentId, conversationId: tab.agentId });
    return release;
  }, [sessionViewModel, tab.agentId]);

  return (
    <AgentSessionProvider controller={sessionViewModel}>
      <DesktopAgentChatView
        tab={tab}
        isSplitView={isSplitView}
        instanceClient={instanceClient}
        timelineController={sessionViewModel.timelineController}
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
  useEffect(() => {
    if (!snapshot.error) return;
    void window.service.native.log('error', 'MemeLoop agent session failed', {
      agentId: tab.agentId,
      error: snapshot.error,
    });
  }, [snapshot.error, tab.agentId]);
  const detailViewModel = useMemo(createDesktopMessageDetailViewModel, []);
  const detailLoader = useMemo(() => createDesktopMessageDetailLoader(detailViewModel), [detailViewModel]);
  const reasoningLoader = useMemo(createDesktopMessageReasoningLoader, []);
  const visibleAttachmentLoader = useMemo(() => createDesktopVisibleAttachmentLoader(detailViewModel), [detailViewModel]);
  const baseAdapter = useAgentSessionChatAdapter({
    conversationId: tab.agentId,
    timelineController,
    createId,
    loadMessageDetail: detailLoader,
    loadMessageReasoning: reasoningLoader,
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
  const editing = useConversationEditing(tab, snapshot.messages, baseAdapter.timeline);
  const conversationWorkspace = useConversationWorkspace(tab.agentId);
  const acknowledgeInitialMessage = useTabStore(useShallow(state => state.acknowledgeInitialMessage));
  const submittedInitialMessageReference = useRef<string | undefined>(undefined);
  const [initialFailed, setInitialFailed] = useState(false);
  const [initialAccepted, setInitialAccepted] = useState(false);
  const [initialAttempt, setInitialAttempt] = useState(0);

  useEffect(() => {
    if (!targets.isReady || !tab.initialMessage) return;
    const identity = `${tab.id}:${tab.agentId}`;
    if (submittedInitialMessageReference.current === identity) return;
    submittedInitialMessageReference.current = identity;
    setInitialFailed(false);
    const requestId = `initial:${tab.id}:${tab.agentId}:request`;
    const turnId = `initial:${tab.id}:${tab.agentId}:turn`;
    void targets.sendMessage(tab.initialMessage, undefined, tab.initialWikiTiddlers, {
      requestId,
      turnId,
      onAccepted: async () => {
        setInitialAccepted(true);
        await acknowledgeInitialMessage(tab.id, tab.agentId, tab.initialMessage!);
      },
    }).then(async () => {
      if (!await acknowledgeInitialMessage(tab.id, tab.agentId, tab.initialMessage!)) setInitialFailed(true);
    }).catch((error: unknown) => {
      setInitialFailed(true);
      void window.service.native.log('error', 'Failed to submit pending initial MemeLoop message', {
        tabId: tab.id,
        agentId: tab.agentId,
        requestId,
        error,
      });
    });
  }, [acknowledgeInitialMessage, initialAttempt, tab.agentId, tab.id, tab.initialMessage, tab.initialWikiTiddlers, targets.isReady, targets.sendMessage]);

  useEffect(() => {
    if (!tab.initialMessage || !snapshot.messages.some(message => message.messageId === `initial:${tab.id}:${tab.agentId}:turn`)) return;
    void acknowledgeInitialMessage(tab.id, tab.agentId, tab.initialMessage).catch((error: unknown) => {
      void window.service.native.log('warn', 'Pending branch acknowledgment will retry after reload', { error });
    });
  }, [acknowledgeInitialMessage, snapshot.messages, tab.agentId, tab.id, tab.initialMessage]);

  const adapter = useMemo((): WebMemeLoopChatAdapter => ({
    ...baseAdapter,
    loadVisibleAttachments: visibleAttachmentLoader,
    executionTargets: targets.executionTargets,
    activeExecutionTarget: targets.activeExecutionTarget,
    setExecutionTarget: targets.setExecutionTarget,
    isRunning: targets.isRunning || baseAdapter.isRunning,
    runningStatus: targets.executionSnapshot?.status === 'queued'
      ? t('Chat.RunStatus.Queued')
      : targets.executionSnapshot?.status === 'cancelling'
      ? t('Chat.RunStatus.Cancelling')
      : snapshot.agent?.status.progress || t('Chat.RunStatus.Working'),
    editing,
    error: targets.error ?? baseAdapter.error,
    cancel: targets.isRunning ? targets.cancelSelectedTarget : baseAdapter.cancel,
    sendMessage: async input => {
      const attachment = input.file ? createDesktopFileAttachmentSource(input.file) : undefined;
      await targets.sendMessage(input.text, attachment, input.wikiTiddlers);
      clearAttachments();
    },
    deleteTurn: targets.deleteTurn,
    retryTurn: targets.retryTurn,
    resolveAskQuestion: (questionId, answer) => resolveDesktopAskQuestion(tab.agentId, questionId, answer),
  }), [baseAdapter, clearAttachments, editing, snapshot.agent?.status.progress, t, tab.agentId, targets, visibleAttachmentLoader]);

  const updateTabData = useTabStore(useShallow(state => state.updateTabData));
  const handleSwitchAgent = useCallback(async (agentDefinitionId: string) => {
    if (agentDefinitionId === tab.agentDefId) return;
    const newAgent = await instanceClient.createAgent(agentDefinitionId);
    updateTabData(tab.id, {
      agentId: newAgent.id,
      agentDefId: agentDefinitionId,
      title: agentDefinitionId,
      initialMessage: undefined,
      initialWikiTiddlers: undefined,
      initialEditSource: undefined,
    });
  }, [instanceClient, tab.agentDefId, tab.id, updateTabData]);

  const resolveErrorPresentation = useCallback((value: Error | ConversationMessageListProjection): AgentChatErrorPresentation | null => {
    const runError = value instanceof Error
      ? extractAgentRunError(value)
      : extractAgentRunError(value.metadata?.agentRunError);
    if (!runError) return null;
    return {
      title: runError.settingTarget === undefined ? t('Chat.Message.Error') : t('Chat.ConfigError.Title'),
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {initialFailed && tab.initialMessage && (
        <Alert severity='error' data-testid='pending-branch-error'>
          <Typography>{t('Chat.Editing.PendingFailed')}</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{tab.initialMessage}</Typography>
          {(!initialAccepted || !tab.initialEditSource) && (
            <Button
              onClick={() => {
                submittedInitialMessageReference.current = undefined;
                setInitialAttempt(value => value + 1);
              }}
            >
              {t('Chat.Actions.Retry')}
            </Button>
          )}
          {tab.initialEditSource && (
            <Button
              onClick={() => {
                void editing.switchBranch(tab.initialEditSource!.conversationId, tab.initialEditSource!.messageId);
              }}
            >
              {t('Chat.Editing.PreviousBranch')}
            </Button>
          )}
        </Alert>
      )}
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
              <TextField
                select
                size='small'
                label={t('Chat.Workspace.Label')}
                value={conversationWorkspace.workspaceId ?? ''}
                disabled={conversationWorkspace.loading || adapter.isRunning}
                data-testid='conversation-workspace-select'
                sx={{ minWidth: 130, maxWidth: 220 }}
                onChange={event => {
                  void conversationWorkspace.select(event.target.value || null).catch((error: unknown) => {
                    void window.service.native.log('error', 'Failed to select conversation workspace', { error });
                  });
                }}
              >
                <MenuItem value=''>{t('Chat.Workspace.Active')}</MenuItem>
                {conversationWorkspace.workspaces.map(workspace => <MenuItem key={workspace.id} value={workspace.id}>{workspace.name}</MenuItem>)}
              </TextField>
              <PromptPreviewButtonWithMenu
                agentId={tab.agentId}
                agentDefinitionId={activeAgentDefinitionId}
              />
              <Tooltip title={t('Preference.ModelParameters')}>
                <IconButton size='small' onClick={() => void openAgentRunErrorSettings()}>
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
        renderMessageContent={message => (
          <RenderedMessageContent
            message={message}
            renderHtml={conversationWorkspace.renderHtml}
            messageLabels={createDesktopMessageLabels(t)}
            onRenderError={error => {
              void window.service.native.log('warn', 'Message rendering fell back to source', { error });
            }}
            labels={{
              document: t('Chat.Rendering.Document'),
            }}
            onInternalLink={title => {
              void (async () => {
                const workspaceId = conversationWorkspace.workspaceId ?? (await window.service.workspace.getActiveWorkspace())?.id;
                if (workspaceId) await window.service.wiki.wikiOperationInBrowser(WikiChannel.openTiddler, workspaceId, [title]);
              })();
            }}
          />
        )}
        genericErrorPresentation={{
          title: t('Chat.Message.Error'),
          message: t('Chat.GenericError'),
        }}
        onErrorAction={handleDesktopAgentErrorAction}
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
          message: (index, total, role) =>
            t('Chat.Timeline.Message', {
              index,
              total,
              role: role === 'user' ? t('Chat.Actions.User') : t('Chat.Actions.Agent'),
            }),
          compacted: count => t('Chat.Timeline.Compacted', { count }),
          loadEarlier: t('Chat.Timeline.LoadEarlier'),
          loadLater: t('Chat.Timeline.LoadLater'),
          seek: t('Chat.Timeline.Seek'),
          close: t('Chat.Timeline.Close'),
          newMessages: count => t('Chat.Timeline.NewMessages', { count }),
          alternatives: count => t('Chat.Editing.Alternatives', { count }),
        }}
        formatTimelineTimestamp={timestamp => timeFormatter.format(new Date(timestamp))}
        actionLabels={{
          retry: t('Chat.Actions.Retry'),
          deleteTurn: t('Chat.Actions.DeleteTurn'),
          copy: t('Chat.Actions.Copy'),
          copyPreview: t('Chat.Actions.CopyPreview'),
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
        messageLabels={createDesktopMessageLabels(t)}
      />
    </Box>
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
  return <DesktopAgentChatSession key={tab.agentId} tab={tab as ActiveChatTab} isSplitView={isSplitView} />;
};
