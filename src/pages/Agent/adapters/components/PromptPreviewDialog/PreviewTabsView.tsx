import { Box, List, Paper, styled, Typography } from '@mui/material';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import type { ModelMessage } from '@services/externalAPI/interface';
import React, { memo, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { useAgentChatStore } from '@/pages/Agent/store/agentChatStore/index';
import { PromptTree } from '@memeloop/react-ui/agent';

interface ModelMessageContent {
  text?: string;
  content?: string;
}

interface PreviewMessage {
  role: string;
  content: string;
}

function getFormattedContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        const typedPart = part as ModelMessageContent;
        if (typedPart.text) return typedPart.text;
        if (typedPart.content) return typedPart.content;
        return '';
      })
      .join('');
  }
  return '';
}

// Styled components
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
  font-family: 'Fira Code', 'JetBrains Mono', 'Fira Mono', 'Menlo', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.7;
  box-shadow: none;
`;

const MessageItem = styled(Paper)(({ theme }) => ({
  marginBottom: theme.spacing(1.5),
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: 'none',
}));

const RoleChip = styled(Typography, {
  shouldForwardProp: (property: string) => property !== 'role',
})<{ role: string }>(({ theme, role }) => ({
  display: 'inline-block',
  padding: theme.spacing(0.5, 1),
  borderRadius: Number(theme.shape.borderRadius) / 2,
  fontSize: 12,
  fontWeight: 600,
  marginBottom: theme.spacing(1),
  background: role.toLowerCase() === 'system'
    ? theme.palette.info.main
    : role.toLowerCase() === 'assistant'
    ? theme.palette.success.main
    : role.toLowerCase() === 'user'
    ? theme.palette.primary.main
    : theme.palette.grey[500],
  color: theme.palette.common.white,
}));

function FlatPromptList({ flatPrompts }: { flatPrompts?: PreviewMessage[] }) {
  const { t } = useTranslation('agent');

  if (!flatPrompts?.length) {
    return (
      <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
        {t('Prompt.NoMessages')}
      </Box>
    );
  }

  return (
    <List disablePadding>
      {flatPrompts.map((message, index) => (
        <MessageItem key={index} elevation={0}>
          <RoleChip role={message.role} variant='caption'>
            {message.role.toUpperCase()}
          </RoleChip>
          <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
            {message.content}
          </Typography>
        </MessageItem>
      ))}
    </List>
  );
}

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

interface PreviewTabsViewProps {
  isFullScreen: boolean;
}

/**
 * Memoized tree content to prevent re-renders when data hasn't changed
 */
const TreeContent = memo<{ isFullScreen: boolean }>(({ isFullScreen }) => {
  const processedPrompts = useAgentChatStore((state) => state.previewResult?.processedPrompts);
  const lastUpdated = useAgentChatStore((state) => state.lastUpdated);
  const setFormFieldsToScrollTo = useAgentChatStore((state) => state.setFormFieldsToScrollTo);

  return (
    <PreviewContent isFullScreen={isFullScreen}>
      <PromptTree prompts={processedPrompts ?? []} onFieldSelect={setFormFieldsToScrollTo} />
      <LastUpdatedIndicator lastUpdated={lastUpdated} />
    </PreviewContent>
  );
});
TreeContent.displayName = 'TreeContent';

/**
 * Memoized flat content to prevent re-renders when data hasn't changed
 */
const FlatContent = memo<{ isFullScreen: boolean }>(({ isFullScreen }) => {
  const flatPrompts = useAgentChatStore((state) => state.previewResult?.flatPrompts);
  const lastUpdated = useAgentChatStore((state) => state.lastUpdated);

  // Memoize formatted preview to prevent unnecessary recalculations
  const formattedFlatPrompts = useMemo(() => {
    return flatPrompts?.map((message: ModelMessage) => ({
      role: message.role,
      content: getFormattedContent(message.content),
    }));
  }, [flatPrompts]);

  return (
    <PreviewContent isFullScreen={isFullScreen}>
      <FlatPromptList flatPrompts={formattedFlatPrompts} />
      <LastUpdatedIndicator lastUpdated={lastUpdated} />
    </PreviewContent>
  );
});
FlatContent.displayName = 'FlatContent';

/**
 * Preview tabs component with flat and tree views
 * Uses memoized sub-components to prevent unnecessary re-renders
 */
export const PreviewTabsView: React.FC<PreviewTabsViewProps> = memo(({
  isFullScreen,
}) => {
  const { t } = useTranslation('agent');

  const {
    previewDialogTab: tab,
    setPreviewDialogTab,
  } = useAgentChatStore(
    useShallow((state) => ({
      previewDialogTab: state.previewDialogTab,
      setPreviewDialogTab: state.setPreviewDialogTab,
    })),
  );

  // Use ref to track if we've ever had content (to avoid flashing on initial load)
  const hasHadContentReference = useRef(false);
  const previewResult = useAgentChatStore((state) => state.previewResult);
  if (previewResult) {
    hasHadContentReference.current = true;
  }

  const handleTabChange = useCallback((_event: React.SyntheticEvent, value: string): void => {
    if (value === 'flat' || value === 'tree') {
      setPreviewDialogTab(value);
    } else {
      setPreviewDialogTab('flat');
    }
  }, [setPreviewDialogTab]);

  // Show nothing if we've never had content (initial loading state)
  // But once we have content, always show it (even during updates)
  if (!hasHadContentReference.current && !previewResult) {
    return null;
  }

  return (
    <Box
      sx={{
        height: isFullScreen ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <PreviewTabs
          value={tab}
          onChange={handleTabChange}
          aria-label='prompt preview tabs'
          variant='fullWidth'
          sx={{ flex: 1 }}
        >
          <Tab
            label={t('Prompt.Tree')}
            value={'tree'}
            sx={{ textTransform: 'none' }}
          />
          <Tab
            label={t('Prompt.Flat')}
            value={'flat'}
            sx={{ textTransform: 'none' }}
          />
        </PreviewTabs>
      </Box>

      {tab === 'tree' && <TreeContent isFullScreen={isFullScreen} />}
      {tab === 'flat' && <FlatContent isFullScreen={isFullScreen} />}
    </Box>
  );
});
