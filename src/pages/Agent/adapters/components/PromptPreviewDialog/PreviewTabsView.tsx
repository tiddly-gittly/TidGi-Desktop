import { PromptExecutionInspector } from '@memeloop/react-ui/agent/prompts';
import { Box, Typography } from '@mui/material';
import type { PromptPreviewController, PromptPreviewDialogState } from 'memeloop';
import React from 'react';
import { useTranslation } from 'react-i18next';

const AUDIT_SOURCE_KEYS = {
  'context-compaction-summary': 'Prompt.AuditSource.CompactionSummary',
  'conversation-message': 'Prompt.AuditSource.ConversationMessage',
  'preview-input': 'Prompt.AuditSource.PreviewInput',
  prompt: 'Prompt.AuditSource.Prompt',
  system: 'Prompt.AuditSource.System',
  tool: 'Prompt.AuditSource.Tool',
} as const;

interface PreviewTabsViewProps {
  isFullScreen: boolean;
  state: PromptPreviewDialogState;
  controller: PromptPreviewController;
}

export function PreviewTabsView({ isFullScreen, state, controller }: PreviewTabsViewProps) {
  const { t, i18n } = useTranslation('agent');
  if (!state.result) return null;
  return (
    <Box data-testid='prompt-preview-execution-audit' sx={{ overflow: 'auto', p: isFullScreen ? 1 : 2, height: isFullScreen ? '100%' : 'auto', minHeight: 240 }}>
      <Typography variant='caption' component='div' sx={{ mb: 1, color: 'text.secondary' }}>
        {t('Prompt.MessageCount')}: {state.result.audit.contextStats.messageCount}
        {' · '}
        {t('Prompt.CompactionSummaryCount')}: {state.result.audit.contextStats.compactionSummaryCount}
      </Typography>
      <PromptExecutionInspector
        audit={state.result.audit}
        controller={controller}
        view={state.activeTab}
        onViewChange={view => {
          controller.setActiveTab(view);
        }}
        onFieldSelect={paths => {
          controller.setFormFieldsToScrollTo(paths);
        }}
        labels={{
          tree: t('Prompt.Tree'),
          flat: t('Prompt.Flat'),
          request: t('Prompt.ModelRequest'),
          back: t('CreateAgent.Back'),
          earlier: t('Chat.Timeline.LoadEarlier'),
          later: t('Chat.Timeline.LoadLater'),
          loading: t('Prompt.Loading'),
          error: t('Prompt.Progress.Error'),
          empty: t('Prompt.NoMessages'),
          editSource: t('Prompt.Edit'),
          source: source => t(AUDIT_SOURCE_KEYS[source]),
          role: role => t(`Prompt.Role.${role}`, { defaultValue: role }),
        }}
      />
      {state.lastUpdated && (
        <Typography variant='caption' component='div' sx={{ mt: 2, textAlign: 'right', color: 'text.secondary' }}>
          {t('Prompt.LastUpdated')}: {state.lastUpdated.toLocaleTimeString(i18n.resolvedLanguage ?? i18n.language)}
        </Typography>
      )}
    </Box>
  );
}
