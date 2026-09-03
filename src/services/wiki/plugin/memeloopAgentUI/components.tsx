import { widget as Widget } from '$:/plugins/linonetwo/tw-react/widget.js';
import { createSecureBrowserUuid } from '@/pages/Agent/adapters/createSecureBrowserUuid';
import { createDesktopAgentConversationClient } from '@/pages/Agent/adapters/DesktopAgentConversationClient';
import { createDesktopFileAttachmentSource } from '@/pages/Agent/adapters/DesktopAgentExecutionCoordinator';
import { createDesktopAgentInstanceClient } from '@/pages/Agent/adapters/DesktopAgentInstanceClient';
import { createDesktopConversationTimelineClient } from '@/pages/Agent/adapters/DesktopConversationTimelineClient';
import { createDesktopMessageDetailLoader } from '@/pages/Agent/adapters/DesktopMessageDetailLoader';
import { createDesktopPromptPreviewController } from '@/pages/Agent/adapters/DesktopPromptPreviewController';
import { createDesktopVisibleAttachmentLoader } from '@/pages/Agent/adapters/DesktopVisibleAttachmentLoader';
import { useExecutionTargets } from '@/pages/Agent/adapters/hooks/useExecutionTargets';
import { localizeAgentRunError } from '@/pages/Agent/adapters/localizeAgentRunError';
import { ScheduledWakeupEditor } from '@/pages/Agent/TabContent/TabTypes/ScheduledWakeupEditor';
import { darkTheme, lightTheme } from '@/services/theme/defaultTheme';
import { AgentChatConfigError, type AgentChatErrorPresentation, AgentChatShell, AgentSessionProvider, useAgentSession, useAgentSessionChatAdapter } from '@memeloop/react-ui/agent';
import { groupGeneratedToolPrompts, PromptTree, type PromptTreeLabels } from '@memeloop/react-ui/agent/prompts';
import {
  ConversationTimelineWindowController,
  DEFAULT_RESIDENT_CONTENT_BYTE_LIMIT,
  DEFAULT_RESIDENT_MESSAGE_LIMIT,
  useAui,
  type WebMemeLoopChatAdapter,
  type WebSelectedAttachmentBatch,
} from '@memeloop/react-ui/chat';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import {
  type AgentDefinition,
  type AgentModelConfig,
  AgentSessionController,
  type AgentSessionTarget,
  type ConversationMessageListProjection,
  extractAgentRunError,
  type ModelCatalog,
  type ModelCatalogModel,
  type ModelCatalogProvider,
  type ProviderAccountConfig,
  type ProviderModelRoute,
} from 'memeloop';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import type { Widget as TiddlyWikiWidget } from 'tiddlywiki';
import { type AttachmentSelection, clearAttachmentSelectionAtRevision, EMPTY_ATTACHMENTS, nextAttachmentSelection } from './attachmentSelection';
import { resolveTiddlyWikiDrop } from './dropPayload';
import { createDesktopWikiAgentHostAdapter, WIKI_AGENT_HOST_LIMITS, type WikiAgentHostAdapter } from './hostAdapter';
import { formatTimelineMessage, getWikiAgentLabels, resolveWikiAgentLocale } from './labels';
import { wikiAgentI18n } from './localization';
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

/**
 * View-only model option. The host boundary exposes canonical Core records;
 * this projection adds only the metadata needed to render a selector.
 */
interface WikiAgentModelOption {
  selection: AgentModelConfig;
  account: ProviderAccountConfig;
  route: ProviderModelRoute;
  provider?: ModelCatalogProvider;
  catalogModel?: ModelCatalogModel;
  label: string;
}

function projectModelOptions(
  accounts: readonly ProviderAccountConfig[],
  catalog: ModelCatalog,
  effectiveSelection: AgentModelConfig | undefined,
): WikiAgentModelOption[] {
  const seen = new Set<string>();
  const result: WikiAgentModelOption[] = [];
  for (const account of accounts) {
    if (account.enabled === false) continue;
    for (const route of account.models) {
      const key = JSON.stringify([account.providerId, route.modelId]);
      if (seen.has(key)) continue;
      seen.add(key);
      const provider = account.catalogProvider ?? catalog.providers.find(candidate => candidate.id === account.providerId);
      const catalogModel = provider?.models.find(model => model.id === route.modelId);
      const selection = effectiveSelection?.providerId === account.providerId && effectiveSelection.modelId === route.modelId
        ? effectiveSelection
        : {
          providerId: account.providerId,
          modelId: route.modelId,
          ...(effectiveSelection?.parameters === undefined ? {} : { parameters: effectiveSelection.parameters }),
        };
      result.push({
        selection,
        account,
        route,
        ...(provider === undefined ? {} : { provider }),
        ...(catalogModel === undefined ? {} : { catalogModel }),
        label: `${provider?.name ?? account.providerId} · ${catalogModel?.name ?? route.modelId}`,
      });
      if (result.length === WIKI_AGENT_HOST_LIMITS.modelOptions) return result;
    }
  }
  return result;
}

function useWikiAgentTarget(
  requestedAgentId: string | undefined,
  controller: AgentSessionController,
  hostAdapter: WikiAgentHostAdapter,
) {
  const [target, setTarget] = useState<AgentSessionTarget>();
  const [discoveryFailed, setDiscoveryFailed] = useState(false);
  const generationReference = useRef(0);

  useEffect(() => {
    const generation = generationReference.current + 1;
    generationReference.current = generation;
    const abortController = new AbortController();
    setTarget(undefined);
    setDiscoveryFailed(false);
    controller.stop();

    void (async () => {
      const resolvedTarget = await hostAdapter.resolveAgentTarget(requestedAgentId, { signal: abortController.signal });
      if (generation !== generationReference.current || abortController.signal.aborted) return;
      await controller.start(resolvedTarget);
      if (generation === generationReference.current && !abortController.signal.aborted) setTarget(resolvedTarget);
    })().catch((error: unknown) => {
      if (generation !== generationReference.current || abortController.signal.aborted) return;
      controller.stop();
      setTarget(undefined);
      setDiscoveryFailed(true);
      hostAdapter.logError('MemeLoop Wiki agent discovery failed', error);
    });

    return () => {
      generationReference.current += 1;
      abortController.abort();
      controller.stop();
    };
  }, [controller, hostAdapter, requestedAgentId]);

  return { target, discoveryFailed };
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
  const [definitions, setDefinitions] = useState<readonly AgentDefinition[]>([]);
  const [models, setModels] = useState<readonly WikiAgentModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<AgentModelConfig>();
  const [loading, setLoading] = useState(true);
  const [operationError, setOperationError] = useState<string>();
  const operationReference = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOperationError(undefined);
    void Promise.all([
      hostAdapter.listAgentDefinitions({ signal: controller.signal }),
      hostAdapter.getModelConfig(agentId, currentDefinitionId, { signal: controller.signal }),
      hostAdapter.listProviderAccounts({ signal: controller.signal }),
      hostAdapter.getProviderCatalog({ signal: controller.signal }),
    ]).then(([nextDefinitions, selectedModel, accounts, catalog]) => {
      if (controller.signal.aborted) return;
      setDefinitions(nextDefinitions);
      setModels(projectModelOptions(accounts, catalog, selectedModel));
      setSelectedModel(selectedModel);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setDefinitions([]);
      setModels([]);
      setSelectedModel(undefined);
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

  const switchAgent = useCallback((definition: AgentDefinition) => {
    operationReference.current?.abort();
    const controller = new AbortController();
    operationReference.current = controller;
    setLoading(true);
    setOperationError(undefined);
    void hostAdapter.createAgent(definition, { signal: controller.signal }).then(agent => {
      if (!controller.signal.aborted) onAgentChange(agent.id);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setOperationError(labels.agentSwitchFailed);
      hostAdapter.logError('MemeLoop Wiki agent switch failed', error);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
  }, [hostAdapter, labels.agentSwitchFailed, onAgentChange]);

  const selectModel = useCallback((optionKey: string) => {
    const option = models.find(candidate => modelOptionKey(candidate) === optionKey);
    if (!option) return;
    operationReference.current?.abort();
    const controller = new AbortController();
    operationReference.current = controller;
    setLoading(true);
    setOperationError(undefined);
    void hostAdapter.selectModel(agentId, option.selection, { signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) setSelectedModel(option.selection);
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
          value={definitions.some(definition => definition.id === currentDefinitionId) ? currentDefinitionId : ''}
          onChange={event => {
            const definition = definitions.find(candidate => candidate.id === event.target.value);
            if (definition) switchAgent(definition);
          }}
        >
          <option value='' disabled>{labels.noOptions}</option>
          {definitions.map(definition => (
            <option key={definition.id} value={definition.id} title={definition.description}>
              {definition.name || definition.id}
            </option>
          ))}
        </select>
      </label>
      <label className='memeloop-tw-chat__selector'>
        <span>{labels.selectModel}</span>
        <select
          aria-label={labels.selectModel}
          disabled={disabled || loading || models.length === 0}
          value={modelSelectionKey(selectedModel)}
          onChange={event => {
            selectModel(event.target.value);
          }}
        >
          <option value='' disabled>{labels.noOptions}</option>
          {models.map(option => {
            const key = modelOptionKey(option);
            return <option key={key} value={key}>{option.label}</option>;
          })}
        </select>
      </label>
      {loading && <span className='memeloop-tw-chat__control-status' role='status'>{labels.loadingOptions}</span>}
      {operationError && <span className='memeloop-tw-chat__control-error' role='alert'>{operationError}</span>}
    </div>
  );
}

function modelSelectionKey(selection: AgentModelConfig | undefined): string {
  return selection === undefined ? '' : JSON.stringify([selection.providerId, selection.modelId]);
}

function modelOptionKey(option: WikiAgentModelOption): string {
  return modelSelectionKey(option.selection);
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
  const { t } = useTranslation('agent');
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
    const nextInput = aui.composer.getState().text;
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
  const promptTreePrompts = useMemo(
    () => groupGeneratedToolPrompts(state.result?.processedPrompts ?? [], t('Prompt.GeneratedTools')),
    [state.result?.processedPrompts, t],
  );
  const promptTreeLabels: Partial<PromptTreeLabels> = {
    empty: t('Prompt.NoPrompts'),
    prompt: t('Prompt.Prompt'),
    role: role => t(`Prompt.Role.${role ?? ''}`, { defaultValue: role ?? '' }),
    expand: t('PromptConfig.Expand'),
    collapse: t('PromptConfig.Collapse'),
  };

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
                <PromptTree prompts={promptTreePrompts} labels={promptTreeLabels} />
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
                        <strong>{t(`Prompt.Role.${item.role}`, { defaultValue: item.role })}</strong>
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
  const translateAgentError = useMemo(() => wikiAgentI18n.getFixedT(locale, 'agent'), [locale]);
  const labels = getWikiAgentLabels(language);
  const loadMessageDetail = useMemo(() => createDesktopMessageDetailLoader(), []);
  const loadVisibleAttachments = useMemo(() => createDesktopVisibleAttachmentLoader(), []);
  const adapterOptions = useMemo(() => ({
    conversationId,
    timelineController,
    createId: createSecureBrowserUuid,
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
    loadVisibleAttachments,
    activeExecutionTarget: targets.activeExecutionTarget,
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
    resolveAskQuestion: async (questionId, answer) => {
      await window.service.agentInstance.resolveAskQuestion(conversationId, questionId, answer);
    },
  }), [baseAdapter, clearAttachmentsForRevision, conversationId, loadVisibleAttachments, targets]);

  const timelineTimestampFormatter = useMemo(() =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }), [locale]);
  const formatTimelineTimestamp = useCallback(
    (timestamp: number) => timelineTimestampFormatter.format(new Date(timestamp)),
    [timelineTimestampFormatter],
  );
  const resolveErrorPresentation = useCallback((value: Error | ConversationMessageListProjection): AgentChatErrorPresentation | null => {
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
        if (presentation.settingTarget) await hostAdapter.openSettings(presentation.settingTarget);
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
        message: (index, total, role) => formatTimelineMessage(index, total, role, locale),
        compacted: labels.compacted,
        loadEarlier: labels.loadEarlier,
        loadLater: labels.loadLater,
        seek: labels.seek,
        close: labels.close,
        newMessages: labels.newMessages,
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
        attachmentLoadFailed: labels.attachmentLoadFailed,
        noDetails: labels.noDetails,
        loadDetails: labels.loadDetails,
        reloadDetails: labels.reloadDetails,
        hideDetails: labels.hideDetails,
        showDetails: labels.showDetails,
        detailTruncated: labels.detailTruncated,
        detailLoadFailed: labels.detailLoadFailed,
        exportFullMessage: labels.exportFullMessage,
        reasoning: labels.reasoning,
        thinking: labels.thinking,
        showReasoning: labels.showReasoning,
        hideReasoning: labels.hideReasoning,
        loadMoreReasoning: labels.loadMoreReasoning,
        reasoningLoadFailed: labels.reasoningLoadFailed,
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
  const { target, discoveryFailed } = useWikiAgentTarget(selectedAgentId, controller, hostAdapter);

  useEffect(() => () => {
    timelineController.dispose();
  }, [timelineController]);

  const content = (() => {
    if (!hostAdapter.isReady()) return <HostUnavailable hostAdapter={hostAdapter} labels={labels} mode={mode} />;
    if (!target) {
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
            key={target.conversationId}
            conversationId={target.conversationId}
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
    <I18nextProvider i18n={wikiAgentI18n}>
      <ThemeProvider theme={theme}>
        <div
          className='memeloop-tw-host'
          data-color-scheme={colorScheme}
          data-testid={`memeloop-wiki-agent-${mode}`}
          dir={direction}
          lang={localeLanguageTag(language)}
        >
          {content}
        </div>
      </ThemeProvider>
    </I18nextProvider>
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
