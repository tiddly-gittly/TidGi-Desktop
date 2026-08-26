import { widget as Widget } from '$:/plugins/linonetwo/tw-react/widget.js';
import { createDesktopAgentConversationClient } from '@/pages/Agent/adapters/DesktopAgentConversationClient';
import { createDesktopFileAttachmentSource } from '@/pages/Agent/adapters/DesktopAgentExecutionCoordinator';
import { createDesktopAgentInstanceClient } from '@/pages/Agent/adapters/DesktopAgentInstanceClient';
import { createDesktopConversationTimelineClient } from '@/pages/Agent/adapters/DesktopConversationTimelineClient';
import { createDesktopMessageDetailLoader } from '@/pages/Agent/adapters/DesktopMessageDetailLoader';
import { createDesktopPromptPreviewController } from '@/pages/Agent/adapters/DesktopPromptPreviewController';
import { useExecutionTargets } from '@/pages/Agent/adapters/hooks/useExecutionTargets';
import { localizeAgentRunError } from '@/pages/Agent/adapters/localizeAgentRunError';
import { ScheduledWakeupEditor } from '@/pages/Agent/TabContent/TabTypes/ScheduledWakeupEditor';
import { darkTheme, lightTheme } from '@/services/theme/defaultTheme';
import { AgentChatConfigError, type AgentChatErrorPresentation, AgentChatShell, AgentSessionProvider, useAgentSession, useAgentSessionChatAdapter } from '@memeloop/react-ui/agent';
import { PromptTree } from '@memeloop/react-ui/agent/prompts';
import {
  ConversationTimelineWindowController,
  DEFAULT_RESIDENT_CONTENT_BYTE_LIMIT,
  DEFAULT_RESIDENT_MESSAGE_LIMIT,
  useAui,
  type WebMemeLoopChatAdapter,
  type WebSelectedAttachmentBatch,
} from '@memeloop/react-ui/chat';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { type AgentDefinition, AgentSessionController, type ChatMessage, extractAgentRunError, type PromptNode } from 'memeloop';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Widget as TiddlyWikiWidget } from 'tiddlywiki';
import { type AttachmentSelection, clearAttachmentSelectionAtRevision, EMPTY_ATTACHMENTS, nextAttachmentSelection } from './attachmentSelection';
import { resolveTiddlyWikiDrop } from './dropPayload';
import { createDesktopWikiAgentHostAdapter, type WikiAgentDefinitionOption, type WikiAgentHostAdapter, type WikiAgentModelOption } from './hostAdapter';
import { formatTimelineTurn, getWikiAgentLabels, resolveWikiAgentLocale } from './labels';
import { resolveWikiAgentColorScheme, resolveWikiAgentDirection, type WikiAgentColorScheme } from './presentation';

/**
 * This Wiki entry owns no agent, transcript, scheduling or prompt-preview state
 * machine. Core/react-ui own those concerns; this file is the replaceable
 * TiddlyWiki + Electron binding and responsive composition layer.
 */

interface MemeLoopAgentChatProps {
  agentId?: string;
  colorScheme?: WikiAgentColorScheme;
  hostAdapter?: WikiAgentHostAdapter;
  language?: string;
  mode?: 'full' | 'sidebar';
  parentWidget?: TiddlyWikiWidget;
}

function browserRequestId(): string {
  if (typeof crypto.randomUUID !== 'function') throw new Error('secure_request_id_unavailable');
  return crypto.randomUUID();
}

function useWikiAgentTarget(
  requestedAgentId: string | undefined,
  controller: AgentSessionController,
  hostAdapter: WikiAgentHostAdapter,
) {
  const [conversationId, setConversationId] = useState<string>();
  const [discoveryFailed, setDiscoveryFailed] = useState(false);
  const generationReference = useRef(0);

  useEffect(() => {
    const generation = generationReference.current + 1;
    generationReference.current = generation;
    const abortController = new AbortController();
    setConversationId(undefined);
    setDiscoveryFailed(false);
    controller.stop();

    void (async () => {
      const resolvedAgentId = await hostAdapter.resolveAgentId(requestedAgentId, { signal: abortController.signal });
      if (generation !== generationReference.current || abortController.signal.aborted) return;
      await controller.start({ agentId: resolvedAgentId, conversationId: resolvedAgentId });
      if (generation === generationReference.current && !abortController.signal.aborted) setConversationId(resolvedAgentId);
    })().catch((error: unknown) => {
      if (generation !== generationReference.current || abortController.signal.aborted) return;
      controller.stop();
      setConversationId(undefined);
      setDiscoveryFailed(true);
      hostAdapter.logError('MemeLoop Wiki agent discovery failed', error);
    });

    return () => {
      generationReference.current += 1;
      abortController.abort();
      controller.stop();
    };
  }, [controller, hostAdapter, requestedAgentId]);

  return { conversationId, discoveryFailed };
}

function WikiAgentSelectors({
  agentId,
  currentDefinitionId,
  disabled,
  hostAdapter,
  labels,
  onAgentChange,
}: {
  agentId: string;
  currentDefinitionId: string;
  disabled: boolean;
  hostAdapter: WikiAgentHostAdapter;
  labels: ReturnType<typeof getWikiAgentLabels>;
  onAgentChange: (agentId: string) => void;
}) {
  const [definitions, setDefinitions] = useState<readonly WikiAgentDefinitionOption[]>([]);
  const [models, setModels] = useState<readonly WikiAgentModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [operationError, setOperationError] = useState<string>();
  const operationReference = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOperationError(undefined);
    void Promise.all([
      hostAdapter.listAgentDefinitions({ signal: controller.signal }),
      hostAdapter.getModelSelection(agentId, currentDefinitionId, { signal: controller.signal }),
    ]).then(([nextDefinitions, modelSelection]) => {
      if (controller.signal.aborted) return;
      setDefinitions(nextDefinitions);
      setModels(modelSelection.options);
      setSelectedModelId(modelSelection.selectedId ?? '');
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setDefinitions([]);
      setModels([]);
      setSelectedModelId('');
      setOperationError(labels.controlsUnavailable);
      hostAdapter.logError('MemeLoop Wiki controls failed to load', error);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
    };
  }, [agentId, currentDefinitionId, hostAdapter, labels.controlsUnavailable]);

  useEffect(() => () => {
    operationReference.current?.abort();
  }, []);

  const switchAgent = useCallback((definitionId: string) => {
    operationReference.current?.abort();
    const controller = new AbortController();
    operationReference.current = controller;
    setLoading(true);
    setOperationError(undefined);
    void hostAdapter.createAgent(definitionId, { signal: controller.signal }).then(agent => {
      if (!controller.signal.aborted) onAgentChange(agent.id);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setOperationError(labels.agentSwitchFailed);
      hostAdapter.logError('MemeLoop Wiki agent switch failed', error);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
  }, [hostAdapter, labels.agentSwitchFailed, onAgentChange]);

  const selectModel = useCallback((modelId: string) => {
    const option = models.find(candidate => candidate.id === modelId);
    if (!option) return;
    operationReference.current?.abort();
    const controller = new AbortController();
    operationReference.current = controller;
    setLoading(true);
    setOperationError(undefined);
    void hostAdapter.selectModel(agentId, option, { signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) setSelectedModelId(option.id);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setOperationError(labels.modelUpdateFailed);
      hostAdapter.logError('MemeLoop Wiki model selection failed', error);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
  }, [agentId, hostAdapter, labels.modelUpdateFailed, models]);

  return (
    <div className='memeloop-tw-chat__selectors' aria-label={labels.agentControls}>
      <label className='memeloop-tw-chat__selector'>
        <span>{labels.selectAgent}</span>
        <select
          aria-label={labels.selectAgent}
          disabled={disabled || loading || definitions.length === 0}
          value={definitions.some(option => option.id === currentDefinitionId) ? currentDefinitionId : ''}
          onChange={event => {
            switchAgent(event.target.value);
          }}
        >
          <option value='' disabled>{labels.noOptions}</option>
          {definitions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <label className='memeloop-tw-chat__selector'>
        <span>{labels.selectModel}</span>
        <select
          aria-label={labels.selectModel}
          disabled={disabled || loading || models.length === 0}
          value={models.some(option => option.id === selectedModelId) ? selectedModelId : ''}
          onChange={event => {
            selectModel(event.target.value);
          }}
        >
          <option value='' disabled>{labels.noOptions}</option>
          {models.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {loading && <span className='memeloop-tw-chat__control-status' role='status'>{labels.loadingOptions}</span>}
      {operationError && <span className='memeloop-tw-chat__control-error' role='alert'>{operationError}</span>}
    </div>
  );
}

function WikiPromptPreview({
  agentDefinitionId,
  agentId,
  disabled,
  hostAdapter,
  labels,
}: {
  agentDefinitionId: string;
  agentId: string;
  disabled: boolean;
  hostAdapter: WikiAgentHostAdapter;
  labels: ReturnType<typeof getWikiAgentLabels>;
}) {
  const aui = useAui();
  const controller = useMemo(createDesktopPromptPreviewController, [agentId]);
  const [state, setState] = useState(() => controller.getState());
  const [inputText, setInputText] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const generationReference = useRef(0);
  const configAbortReference = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    return () => {
      generationReference.current += 1;
      configAbortReference.current?.abort();
      unsubscribe();
      controller.close();
    };
  }, [controller]);

  const close = useCallback(() => {
    generationReference.current += 1;
    configAbortReference.current?.abort();
    configAbortReference.current = undefined;
    controller.close();
    setPreviewError(false);
  }, [controller]);

  useEffect(() => {
    if (!state.open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [close, state.open]);

  const open = useCallback(() => {
    const generation = generationReference.current + 1;
    generationReference.current = generation;
    configAbortReference.current?.abort();
    const abortController = new AbortController();
    configAbortReference.current = abortController;
    const nextInput = aui.composer().getState().text;
    setInputText(nextInput);
    setPreviewError(false);
    controller.open();
    void hostAdapter.getAgentFrameworkConfig(agentId, agentDefinitionId, { signal: abortController.signal }).then(async config => {
      if (generation !== generationReference.current || !controller.getState().open) return;
      if (!config) throw new Error('agent_framework_config_unavailable');
      await controller.generate(config, agentId, nextInput.trim() || undefined);
    }).catch((error: unknown) => {
      if (generation !== generationReference.current || !controller.getState().open) return;
      setPreviewError(true);
      hostAdapter.logError('MemeLoop Wiki prompt preview failed', error);
    }).finally(() => {
      if (configAbortReference.current === abortController) configAbortReference.current = undefined;
    });
  }, [agentDefinitionId, agentId, aui, controller, hostAdapter]);

  const audit = state.result?.audit;

  return (
    <>
      <button
        className='memeloop-tw-chat__action'
        type='button'
        aria-expanded={state.open}
        aria-haspopup='dialog'
        disabled={disabled}
        onClick={open}
      >
        {labels.promptPreview}
      </button>
      {state.open && (
        <div className='memeloop-tw-chat__preview-backdrop' role='presentation'>
          <section
            aria-label={labels.promptPreview}
            aria-modal='true'
            className='memeloop-tw-chat__preview'
            role='dialog'
          >
            <header className='memeloop-tw-chat__preview-header'>
              <strong>{labels.promptPreview}</strong>
              <button autoFocus className='memeloop-tw-chat__action' type='button' onClick={close}>{labels.close}</button>
            </header>
            {state.loading && (
              <p role='status'>
                {labels.previewLoading} {Math.round(Math.max(0, Math.min(1, state.progress)) * 100)}%
              </p>
            )}
            {previewError && <p role='alert'>{labels.previewFailed}</p>}
            {!state.loading && !previewError && !state.result && <p>{labels.previewUnavailable}</p>}
            {state.result && (
              <div className='memeloop-tw-chat__preview-content'>
                <PromptTree prompts={state.result.processedPrompts as PromptNode[]} />
                {audit && (
                  <section className='memeloop-tw-chat__preview-context' aria-label={labels.previewContext}>
                    <h3>{labels.previewContext}</h3>
                    <p>
                      {labels.previewMessageCount(audit.contextStats.messageCount)}
                      {' · '}
                      {labels.previewCompactionCount(audit.contextStats.compactionSummaryCount)}
                    </p>
                    {audit.initialPage.items.map(item => (
                      <article className='memeloop-tw-chat__preview-entry' key={item.entryId}>
                        <strong>{item.role}</strong>
                        <p>{item.preview || labels.noDetails}</p>
                      </article>
                    ))}
                  </section>
                )}
                {inputText && <p className='memeloop-tw-chat__preview-input'>{labels.previewIncludesDraft}</p>}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function WikiScheduledTaskPanel({
  agentDefinitionId,
  hostAdapter,
  labels,
}: {
  agentDefinitionId: string;
  hostAdapter: WikiAgentHostAdapter;
  labels: ReturnType<typeof getWikiAgentLabels>;
}) {
  const [definition, setDefinition] = useState<AgentDefinition>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setDefinition(undefined);
    setFailed(false);
    void hostAdapter.getAgentDefinition(agentDefinitionId, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setDefinition(value);
      setFailed(value === undefined);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setFailed(true);
      hostAdapter.logError('MemeLoop Wiki schedule definition failed to load', error);
    });
    return () => {
      controller.abort();
    };
  }, [agentDefinitionId, hostAdapter]);

  return (
    <details className='memeloop-tw-chat__schedule'>
      <summary>{labels.schedule}</summary>
      <div className='memeloop-tw-chat__schedule-content'>
        {definition
          ? <ScheduledWakeupEditor agentDefinition={definition} />
          : <p role={failed ? 'alert' : 'status'}>{failed ? labels.scheduleUnavailable : labels.loadingOptions}</p>}
      </div>
    </details>
  );
}

function BoundMemeLoopWikiChat({
  conversationId,
  hostAdapter,
  language,
  onAgentChange,
  parentWidget,
  timelineController,
}: Required<Pick<MemeLoopAgentChatProps, 'language'>> & Pick<MemeLoopAgentChatProps, 'parentWidget'> & {
  conversationId: string;
  hostAdapter: WikiAgentHostAdapter;
  onAgentChange: (agentId: string) => void;
  timelineController: ConversationTimelineWindowController;
}) {
  const { snapshot } = useAgentSession();
  const [attachments, setAttachments] = useState<AttachmentSelection>(EMPTY_ATTACHMENTS);
  const workspaceName = $tw.wiki.getTiddlerText('$:/info/tidgi/workspaceName', '') || $tw.wiki.getTiddlerText('$:/SiteTitle', 'Wiki');
  const locale = resolveWikiAgentLocale(language);
  const { i18n } = useTranslation('agent');
  const translateAgentError = useMemo(() => i18n.getFixedT(locale, 'agent'), [i18n, locale]);
  const labels = getWikiAgentLabels(language);
  const loadMessageDetail = useMemo(() => createDesktopMessageDetailLoader(), []);
  const adapterOptions = useMemo(() => ({
    conversationId,
    timelineController,
    createId: browserRequestId,
    loadMessageDetail,
    onError: (error: Error, operation: string) => {
      hostAdapter.logError(`MemeLoop Wiki chat operation failed: ${operation}`, error);
    },
  }), [conversationId, hostAdapter, loadMessageDetail, timelineController]);
  const baseAdapter = useAgentSessionChatAdapter(adapterOptions);
  const targets = useExecutionTargets({
    agent: snapshot.agent,
    orderedMessages: snapshot.messages,
  });
  const currentDefinitionId = snapshot.agent?.agentDefId || 'memeloop:general-assistant';

  const selectAttachments = useCallback((batch: WebSelectedAttachmentBatch) => {
    setAttachments(current => nextAttachmentSelection(current, batch));
  }, []);
  const clearAttachmentsForRevision = useMemo(() => {
    const sentRevision = attachments.revision;
    return () => {
      setAttachments(current => clearAttachmentSelectionAtRevision(current, sentRevision));
    };
  }, [attachments.revision]);

  const adapter = useMemo((): WebMemeLoopChatAdapter => ({
    ...baseAdapter,
    activeExecutionTargetId: targets.activeExecutionTargetId,
    error: targets.error ?? baseAdapter.error,
    executionTargets: targets.executionTargets,
    isRunning: targets.isRunning,
    residentContentByteLimit: DEFAULT_RESIDENT_CONTENT_BYTE_LIMIT,
    residentMessageLimit: DEFAULT_RESIDENT_MESSAGE_LIMIT,
    setExecutionTarget: targets.setExecutionTarget,
    cancel: targets.cancelSelectedTarget,
    sendMessage: async input => {
      const attachment = input.file ? createDesktopFileAttachmentSource(input.file) : undefined;
      await targets.sendMessage(input.text, attachment, input.wikiTiddlers);
      clearAttachmentsForRevision();
    },
    deleteTurn: targets.deleteTurn,
    retryTurn: targets.retryTurn,
  }), [baseAdapter, clearAttachmentsForRevision, targets]);

  const timelineTimestampFormatter = useMemo(() =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }), [locale]);
  const formatTimelineTimestamp = useCallback(
    (timestamp: number) => timelineTimestampFormatter.format(new Date(timestamp)),
    [timelineTimestampFormatter],
  );
  const resolveErrorPresentation = useCallback((value: Error | ChatMessage): AgentChatErrorPresentation | null => {
    const runError = value instanceof Error
      ? extractAgentRunError(value)
      : extractAgentRunError(value.metadata?.agentRunError);
    if (!runError) return null;
    return {
      title: labels.configErrorTitle,
      message: localizeAgentRunError(runError, translateAgentError),
      diagnosticId: runError.diagnosticId,
      settingTarget: runError.settingTarget,
      ...(runError.settingTarget === undefined
        ? {}
        : { actionLabel: labels.configure, actionId: 'open-external-api-settings' }),
    };
  }, [labels.configErrorTitle, labels.configure, translateAgentError]);

  return (
    <AgentChatShell
      adapter={adapter}
      header={{ title: snapshot.agent?.name || labels.agent }}
      toolbar={{
        primary: (
          <WikiAgentSelectors
            agentId={conversationId}
            currentDefinitionId={currentDefinitionId}
            disabled={adapter.isRunning}
            hostAdapter={hostAdapter}
            labels={labels}
            onAgentChange={onAgentChange}
          />
        ),
        secondary: (
          <WikiPromptPreview
            agentId={conversationId}
            agentDefinitionId={currentDefinitionId}
            disabled={adapter.isRunning}
            hostAdapter={hostAdapter}
            labels={labels}
          />
        ),
        loading: adapter.isLoading,
        status: snapshot.agent?.status.progress
          ? <span className='memeloop-tw-chat__status'>{snapshot.agent.status.progress}</span>
          : undefined,
      }}
      footer={
        <WikiScheduledTaskPanel
          agentDefinitionId={currentDefinitionId}
          hostAdapter={hostAdapter}
          labels={labels}
        />
      }
      resolveErrorPresentation={resolveErrorPresentation}
      genericErrorPresentation={{ title: labels.configErrorTitle, message: labels.genericError }}
      onErrorAction={async presentation => {
        if (presentation.settingTarget) await hostAdapter.openSettings();
      }}
      onShellError={(error, operation) => {
        hostAdapter.logError(`MemeLoop Wiki shell operation failed: ${operation}`, error);
      }}
      selectedFile={attachments.file}
      selectedWikiTiddlers={attachments.wikiTiddlers}
      onAttachmentsSelect={selectAttachments}
      onClearFile={() => {
        setAttachments(current => nextAttachmentSelection(current, { wikiTiddlers: current.wikiTiddlers }));
      }}
      onClearAttachments={clearAttachmentsForRevision}
      onRemoveWikiTiddler={index => {
        setAttachments(current =>
          nextAttachmentSelection(current, {
            ...(current.file === undefined ? {} : { file: current.file }),
            wikiTiddlers: current.wikiTiddlers.filter((_, itemIndex) => itemIndex !== index),
          })
        );
      }}
      resolveDroppedWikiTiddlers={drop => resolveTiddlyWikiDrop(drop, workspaceName)}
      onWikiTiddlerClick={tiddler => {
        parentWidget?.dispatchEvent({ type: 'tm-navigate', navigateTo: tiddler.tiddlerTitle });
      }}
      disabled={!snapshot.agent || adapter.isRunning}
      placeholder={labels.placeholder}
      loadingMessage={labels.loading}
      emptyMessage={labels.empty}
      operationErrorMessage={labels.operationError}
      composerLabels={{
        input: labels.composerInput,
        send: labels.send,
        cancel: labels.cancel,
        addFile: labels.addFile,
        removeFile: labels.removeFile,
        removeTiddler: labels.removeTiddler,
      }}
      executionTargetLabels={{
        runOn: labels.runOn,
        executionTarget: labels.executionTarget,
        runOnTarget: labels.runOnTarget,
        confirmTitle: labels.targetConfirmTitle,
        confirmDescription: labels.targetConfirmDescription,
        anotherTarget: labels.anotherTarget,
        keepRunning: labels.keepRunning,
        stopAndRestart: labels.stopAndRestart,
        operationFailed: labels.operationError,
      }}
      timelineLabels={{
        navigation: labels.timelineNavigation,
        turn: (index, total) => formatTimelineTurn(index, total, locale),
        compacted: labels.compacted,
        loadEarlier: labels.loadEarlier,
        loadLater: labels.loadLater,
        seek: labels.seek,
        close: labels.close,
        newMessages: labels.newMessages,
        moreResponses: labels.moreResponses,
      }}
      formatTimelineTimestamp={formatTimelineTimestamp}
      actionLabels={{
        retry: labels.retry,
        deleteTurn: labels.deleteTurn,
        copy: labels.copy,
        copyAll: labels.copyAll,
        user: labels.user,
        agent: labels.agent,
      }}
      messageLabels={{
        attachmentAlt: labels.attachment,
        noDetails: labels.noDetails,
        loadDetails: labels.loadDetails,
        reloadDetails: labels.reloadDetails,
        hideDetails: labels.hideDetails,
        showDetails: labels.showDetails,
        detailTruncated: labels.detailTruncated,
        detailLoadFailed: labels.detailLoadFailed,
        error: labels.error,
        toolResult: labels.toolResult,
        toolCall: labels.toolCall,
        truncated: labels.truncated,
        askQuestion: {
          answerPlaceholder: labels.answerPlaceholder,
          submit: labels.submit,
          confirmSelection: labels.confirmSelection,
          answered: labels.answered,
        },
      }}
    />
  );
}

function HostUnavailable({
  hostAdapter,
  labels,
  mode,
}: {
  hostAdapter: WikiAgentHostAdapter;
  labels: ReturnType<typeof getWikiAgentLabels>;
  mode: 'full' | 'sidebar';
}) {
  const [actionFailed, setActionFailed] = useState(false);
  return (
    <div className={`memeloop-tw-chat memeloop-tw-chat--${mode} memeloop-tw-chat--loading`}>
      <AgentChatConfigError
        title={labels.configErrorTitle}
        message={actionFailed ? labels.settingsUnavailable : labels.hostUnavailable}
        actionLabel={labels.configure}
        actionId='open-external-api-settings'
        onAction={async () => {
          setActionFailed(false);
          try {
            await hostAdapter.openSettings();
          } catch (error) {
            setActionFailed(true);
            hostAdapter.logError('MemeLoop Wiki settings action failed', error);
          }
        }}
      />
    </div>
  );
}

function MemeLoopWikiChat({
  agentId,
  colorScheme = 'light',
  hostAdapter: injectedHostAdapter,
  language = navigator.language,
  mode = 'full',
  parentWidget,
}: MemeLoopAgentChatProps) {
  const hostAdapter = useMemo(
    () => injectedHostAdapter ?? createDesktopWikiAgentHostAdapter(),
    [injectedHostAdapter],
  );
  const direction = resolveWikiAgentDirection(language);
  const theme = useMemo(() =>
    createTheme(
      colorScheme === 'dark' ? darkTheme : lightTheme,
      { direction, typography: { fontFamily: 'inherit' } },
    ), [colorScheme, direction]);
  const labels = getWikiAgentLabels(language);
  const [selectedAgentId, setSelectedAgentId] = useState(agentId);
  useEffect(() => {
    setSelectedAgentId(agentId);
  }, [agentId]);
  const controller = useMemo(() =>
    new AgentSessionController({
      agentInstanceClient: createDesktopAgentInstanceClient(),
      conversationClient: createDesktopAgentConversationClient(),
      maxResidentMessages: DEFAULT_RESIDENT_MESSAGE_LIMIT,
      maxResidentBytes: DEFAULT_RESIDENT_CONTENT_BYTE_LIMIT,
    }), []);
  const timelineController = useMemo(
    () => new ConversationTimelineWindowController(createDesktopConversationTimelineClient()),
    [],
  );
  const { conversationId, discoveryFailed } = useWikiAgentTarget(selectedAgentId, controller, hostAdapter);

  useEffect(() => () => {
    timelineController.dispose();
  }, [timelineController]);

  const content = (() => {
    if (!hostAdapter.isReady()) return <HostUnavailable hostAdapter={hostAdapter} labels={labels} mode={mode} />;
    if (!conversationId) {
      return (
        <div className={`memeloop-tw-chat memeloop-tw-chat--${mode} memeloop-tw-chat--loading`}>
          {discoveryFailed
            ? (
              <AgentChatConfigError
                title={labels.configErrorTitle}
                message={labels.genericError}
                actionLabel={labels.configure}
                onAction={() => hostAdapter.openSettings()}
              />
            )
            : labels.loading}
        </div>
      );
    }
    return (
      <div className={`memeloop-tw-chat memeloop-tw-chat--${mode}`}>
        <AgentSessionProvider controller={controller}>
          <BoundMemeLoopWikiChat
            key={conversationId}
            conversationId={conversationId}
            hostAdapter={hostAdapter}
            language={language}
            onAgentChange={setSelectedAgentId}
            parentWidget={parentWidget}
            timelineController={timelineController}
          />
        </AgentSessionProvider>
      </div>
    );
  })();

  return (
    <ThemeProvider theme={theme}>
      <div
        className='memeloop-tw-host'
        data-color-scheme={colorScheme}
        dir={direction}
        lang={localeLanguageTag(language)}
      >
        {content}
      </div>
    </ThemeProvider>
  );
}

function localeLanguageTag(language: string): string {
  return language.replace(/^\$:\/languages\//u, '') || 'en';
}

function wikiPresentationProps(): Pick<MemeLoopAgentChatProps, 'colorScheme' | 'language'> {
  const language = $tw.wiki.getTiddlerText('$:/language', '') || navigator.language;
  const paletteTitle = $tw.wiki.getTiddlerText('$:/palette', '$:/palettes/Vanilla');
  const palette = $tw.wiki.getTiddler(paletteTitle);
  return {
    language,
    colorScheme: resolveWikiAgentColorScheme(palette?.fields['color-scheme']),
  };
}

class MemeLoopAgentChatWidget extends Widget<MemeLoopAgentChatProps> {
  reactComponent = MemeLoopWikiChat;
  getProps = (): MemeLoopAgentChatProps => ({
    agentId: this.getAttribute('agentId'),
    mode: this.getAttribute('mode', 'full') === 'sidebar' ? 'sidebar' as const : 'full' as const,
    parentWidget: this,
    ...wikiPresentationProps(),
  });

  refresh(changedTiddlers: Record<string, unknown>): boolean {
    const paletteTitle = $tw.wiki.getTiddlerText('$:/palette', '$:/palettes/Vanilla');
    const presentationChanged = [
      '$:/language',
      '$:/palette',
      '$:/info/tidgi/workspaceName',
      '$:/SiteTitle',
      paletteTitle,
    ].some(title => Object.hasOwn(changedTiddlers, title));
    if (!presentationChanged) return false;
    this.refreshSelf();
    return true;
  }
}

const pluginExports = module.exports as Record<string, unknown>;
pluginExports.MemeLoopAgentChatWidget = MemeLoopAgentChatWidget;
