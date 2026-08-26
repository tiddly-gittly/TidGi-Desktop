import { PromptTree } from '@memeloop/react-ui/agent/prompts';
import { Box, Button, Chip, Divider, Paper, styled, Typography } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import {
  MAX_PROMPT_PREVIEW_AUDIT_DETAIL_CHUNK_BYTES,
  MAX_PROMPT_PREVIEW_AUDIT_PAGE_BYTES,
  MAX_PROMPT_PREVIEW_AUDIT_PAGE_ENTRIES,
  type PromptNode,
  type PromptPreviewAuditDetailTarget,
  type PromptPreviewAuditPage,
  type PromptPreviewController,
  type PromptPreviewDialogState,
  type PromptPreviewPreparedExecution,
} from 'memeloop';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DETAIL_CHUNK_BYTES = Math.min(64 * 1_024, MAX_PROMPT_PREVIEW_AUDIT_DETAIL_CHUNK_BYTES);
const PAGE_BYTES = Math.min(128 * 1_024, MAX_PROMPT_PREVIEW_AUDIT_PAGE_BYTES);
const AUDIT_SOURCE_KEYS = {
  'context-compaction-summary': 'Prompt.AuditSource.CompactionSummary',
  'conversation-message': 'Prompt.AuditSource.ConversationMessage',
  'preview-input': 'Prompt.AuditSource.PreviewInput',
  prompt: 'Prompt.AuditSource.Prompt',
  system: 'Prompt.AuditSource.System',
  tool: 'Prompt.AuditSource.Tool',
} as const;

const PreviewTabs = styled(Tabs)`
  margin-bottom: ${({ theme }) => theme.spacing(2)};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

const PreviewContent = styled('div', {
  shouldForwardProp: (property: string) => property !== 'isFullScreen',
})<{ isFullScreen?: boolean }>`
  background: ${({ theme }) => theme.palette.background.paper};
  border-radius: ${({ isFullScreen, theme }) => isFullScreen ? 0 : theme.shape.borderRadius};
  padding: ${({ isFullScreen, theme }) => isFullScreen ? theme.spacing(1) : theme.spacing(2)};
  min-height: 240px;
  max-height: ${({ isFullScreen }) => isFullScreen ? 'calc(100vh - 120px)' : '60vh'};
  height: ${({ isFullScreen }) => isFullScreen ? 'calc(100vh - 120px)' : 'auto'};
  overflow: auto;
`;

function LastUpdatedIndicator({ lastUpdated }: { lastUpdated: Date | null }) {
  const { t } = useTranslation('agent');
  if (!lastUpdated) return null;
  return (
    <Box sx={{ mt: 2, pt: 1, borderTop: '1px dashed', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
      <Typography variant='caption' sx={{ color: 'text.secondary' }}>
        {t('Prompt.LastUpdated')}: {lastUpdated.toLocaleTimeString()}
      </Typography>
    </Box>
  );
}

const TreeContent = memo<{
  isFullScreen: boolean;
  state: PromptPreviewDialogState;
  controller: PromptPreviewController;
}>(({ isFullScreen, state, controller }) => (
  <PreviewContent isFullScreen={isFullScreen}>
    <PromptTree
      prompts={(state.result?.processedPrompts ?? []) as PromptNode[]}
      onFieldSelect={(paths: string[]) => {
        controller.setFormFieldsToScrollTo(paths);
      }}
    />
    <LastUpdatedIndicator lastUpdated={state.lastUpdated} />
  </PreviewContent>
));
TreeContent.displayName = 'TreeContent';

function AuditContent({
  isFullScreen,
  audit,
  controller,
}: {
  isFullScreen: boolean;
  audit: PromptPreviewPreparedExecution;
  controller: PromptPreviewController;
}) {
  const { t } = useTranslation('agent');
  const [page, setPage] = useState<PromptPreviewAuditPage>(audit.initialPage);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{
    target: PromptPreviewAuditDetailTarget;
    text: string;
    nextCursor?: string;
    returnEntryIndex: number;
  }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    setPage(audit.initialPage);
    setDetail(undefined);
    setError(false);
  }, [audit]);

  const loadPage = useCallback(async (direction: 'before' | 'after') => {
    const cursor = direction === 'before' ? page.previousCursor : page.nextCursor;
    if (!cursor || loading) return;
    setLoading(true);
    setError(false);
    try {
      const next = await controller.getAuditPage({
        mode: direction,
        cursor,
        sessionId: audit.sessionId,
        expectedRevision: audit.revision,
        limit: MAX_PROMPT_PREVIEW_AUDIT_PAGE_ENTRIES,
        maxBytes: PAGE_BYTES,
      });
      // Replace rather than append: renderer residency is always one page.
      setPage(next);
      setDetail(undefined);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [audit.revision, audit.sessionId, controller, loading, page.nextCursor, page.previousCursor]);

  const loadDetail = useCallback(async (target: PromptPreviewAuditDetailTarget, cursor?: string) => {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const chunk = await controller.getAuditDetail({
        sessionId: audit.sessionId,
        expectedRevision: audit.revision,
        target,
        ...(cursor === undefined ? {} : { cursor }),
        maxBytes: DETAIL_CHUNK_BYTES,
      });
      // Each navigation replaces the prior chunk; full multi-MiB detail is
      // never accumulated in renderer state.
      setDetail({
        target,
        text: new TextDecoder('utf-8', { fatal: true }).decode(chunk.canonicalUtf8),
        returnEntryIndex: detail?.returnEntryIndex ?? page.items[0]?.entryIndex ?? 0,
        ...(chunk.nextCursor === undefined ? {} : { nextCursor: chunk.nextCursor }),
      });
      // Do not retain a summary page and detail chunk simultaneously.
      setPage({
        sessionId: audit.sessionId,
        revision: audit.revision,
        items: [],
        totalEntries: audit.initialPage.totalEntries,
        hasMoreBefore: false,
        hasMoreAfter: false,
        sampled: false,
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [audit.initialPage.totalEntries, audit.revision, audit.sessionId, controller, detail?.returnEntryIndex, loading, page.items]);

  const closeDetail = useCallback(async () => {
    if (!detail || loading) return;
    setLoading(true);
    setError(false);
    try {
      if (audit.initialPage.totalEntries === 0) {
        setPage(audit.initialPage);
        setDetail(undefined);
        return;
      }
      const restored = await controller.getAuditPage({
        mode: 'around',
        entryIndex: Math.min(detail.returnEntryIndex, Math.max(0, audit.initialPage.totalEntries - 1)),
        sessionId: audit.sessionId,
        expectedRevision: audit.revision,
        limit: MAX_PROMPT_PREVIEW_AUDIT_PAGE_ENTRIES,
        maxBytes: PAGE_BYTES,
      });
      setPage(restored);
      setDetail(undefined);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [audit.initialPage.totalEntries, audit.revision, audit.sessionId, controller, detail, loading]);

  return (
    <PreviewContent isFullScreen={isFullScreen} data-testid='prompt-preview-execution-audit'>
      <Typography variant='subtitle2'>{t('Prompt.ModelRequest')}</Typography>
      <Typography variant='body2' sx={{ overflowWrap: 'anywhere', mb: 1 }}>
        {audit.route.providerId} · {audit.route.logicalModelId} → {audit.route.wireModelId} · {audit.route.apiMode}
      </Typography>
      <Typography variant='body2' sx={{ mb: 1 }}>
        {t('Prompt.MessageCount')}: {audit.contextStats.messageCount}
        {' · '}
        {t('Prompt.CompactionSummaryCount')}: {audit.contextStats.compactionSummaryCount}
      </Typography>
      <Button
        size='small'
        onClick={() => {
          void loadDetail({ kind: 'request' });
        }}
      >
        {t('Prompt.ModelRequest')}
      </Button>
      <Divider sx={{ my: 1.5 }} />

      {!detail && page.items.map(entry => (
        <Paper key={entry.entryId} variant='outlined' sx={{ p: 1.5, mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip size='small' label={entry.role} />
            <Chip size='small' variant='outlined' label={t(AUDIT_SOURCE_KEYS[entry.source])} />
            <Typography variant='caption'>#{entry.entryIndex + 1} · {entry.canonicalBytes} B</Typography>
          </Box>
          <Button
            fullWidth
            sx={{ mt: 1, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none' }}
            onClick={() => {
              void loadDetail({ kind: 'entry', entryId: entry.entryId, entryIndex: entry.entryIndex });
            }}
          >
            <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {entry.preview || t('Prompt.NoMessages')}
            </Typography>
          </Button>
        </Paper>
      ))}

      {!detail && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Button disabled={!page.hasMoreBefore || loading} onClick={() => void loadPage('before')}>
            {t('Chat.Timeline.LoadEarlier')}
          </Button>
          <Typography variant='caption' sx={{ alignSelf: 'center' }}>
            {page.items.length} / {page.totalEntries}
          </Typography>
          <Button disabled={!page.hasMoreAfter || loading} onClick={() => void loadPage('after')}>
            {t('Chat.Timeline.LoadLater')}
          </Button>
        </Box>
      )}

      {detail && (
        <Paper variant='outlined' sx={{ p: 1.5, mt: 1.5 }} data-testid='prompt-preview-audit-detail'>
          <Button size='small' disabled={loading} onClick={() => void closeDetail()}>
            {t('Prompt.Close')}
          </Button>
          <Typography component='pre' sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {detail.text}
          </Typography>
          {detail.nextCursor && (
            <Button
              size='small'
              disabled={loading}
              onClick={() => {
                void loadDetail(detail.target, detail.nextCursor);
              }}
            >
              {t('Chat.Timeline.LoadLater')}
            </Button>
          )}
        </Paper>
      )}
      {error && <Typography color='error'>{t('Prompt.Progress.Error')}</Typography>}
    </PreviewContent>
  );
}

interface PreviewTabsViewProps {
  isFullScreen: boolean;
  state: PromptPreviewDialogState;
  controller: PromptPreviewController;
}

export const PreviewTabsView: React.FC<PreviewTabsViewProps> = memo(({ isFullScreen, state, controller }) => {
  const { t } = useTranslation('agent');
  const handleTabChange = useCallback((_event: React.SyntheticEvent, value: string): void => {
    controller.setActiveTab(value === 'tree' ? 'tree' : 'flat');
  }, [controller]);
  if (!state.result) return null;
  return (
    <Box sx={{ height: isFullScreen ? '100%' : 'auto', display: 'flex', flexDirection: 'column' }}>
      <PreviewTabs
        value={state.activeTab}
        onChange={handleTabChange}
        aria-label={t('Prompt.PreviewTabs')}
        variant='fullWidth'
      >
        <Tab label={t('Prompt.Tree')} value='tree' sx={{ textTransform: 'none' }} />
        <Tab label={t('Prompt.Flat')} value='flat' sx={{ textTransform: 'none' }} />
      </PreviewTabs>
      {state.activeTab === 'tree'
        ? <TreeContent isFullScreen={isFullScreen} state={state} controller={controller} />
        : <AuditContent isFullScreen={isFullScreen} audit={state.result.audit} controller={controller} />}
    </Box>
  );
});
