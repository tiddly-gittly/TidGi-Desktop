/* eslint-disable unicorn/prevent-abbreviations */
import { useHandlerConfigManagement } from '@/pages/Preferences/sections/ExternalAPI/useHandlerConfigManagement';
import CloseIcon from '@mui/icons-material/Close';
import { TabContext, TabPanel } from '@mui/lab';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import Paper from '@mui/material/Paper';
import { styled } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { IPromptPart } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { CoreMessage } from 'ai';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../../../../store/agentChatStore/index';
import { PromptConfigForm } from './PromptConfigForm';

// Types
interface PreviewMessage {
  role: string;
  content: string;
}

interface CoreMessageContent {
  text?: string;
  content?: string;
}

// Convert CoreMessage content to string safely
function getFormattedContent(content: CoreMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        const typedPart = part as CoreMessageContent;
        if (typedPart.text) return typedPart.text;
        if (typedPart.content) return typedPart.content;
        return '';
      })
      .join('');
  }
  return '';
}

// Styled components
const PreviewTabs = styled(Tabs)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const PreviewContent = styled(Paper)(({ theme }) => ({
  background: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(2),
  minHeight: 240,
  maxHeight: '60vh',
  overflow: 'auto',
  fontFamily: '"JetBrains Mono", "Fira Mono", "Menlo", "Consolas", monospace',
  fontSize: 14,
  lineHeight: 1.7,
  boxShadow: 'none',
}));

const MessageItem = styled(Paper)(({ theme }) => ({
  marginBottom: theme.spacing(1.5),
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    boxShadow: theme.shadows[2],
  },
}));

const RoleChip = styled(Typography, {
  shouldForwardProp: (property: string) => property !== 'role',
})<{ role: string }>(({ theme, role }) => ({
  display: 'inline-block',
  padding: theme.spacing(0.5, 1),
  borderRadius: theme.shape.borderRadius / 2,
  fontSize: 12,
  fontWeight: 600,
  marginBottom: theme.spacing(1),
  background: (() => {
    switch (role.toLowerCase()) {
      case 'system':
        return theme.palette.info.main;
      case 'assistant':
        return theme.palette.success.main;
      case 'user':
        return theme.palette.primary.main;
      default:
        return theme.palette.grey[500];
    }
  })(),
  color: theme.palette.common.white,
}));

const TreeItem = styled(Box, {
  shouldForwardProp: (property: string) => property !== 'depth',
})<{ depth: number }>(({ theme, depth }) => ({
  padding: theme.spacing(1.5),
  margin: `${depth * 8}px 0 0 ${depth * 16}px`,
  borderLeft: `2px solid ${theme.palette.primary.main}`,
  background: theme.palette.background.default,
  borderRadius: theme.shape.borderRadius / 2,
  '&:hover': {
    background: theme.palette.action.hover,
  },
}));

const EmptyState = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: 240,
  color: theme.palette.text.secondary,
  '& > svg': {
    fontSize: 48,
    marginBottom: theme.spacing(2),
    opacity: 0.5,
  },
}));

function FlatPromptList({ flatPrompts }: { flatPrompts?: PreviewMessage[] }): React.ReactElement {
  if (!flatPrompts?.length) {
    return <EmptyState>No messages to preview</EmptyState>;
  }

  return (
    <List disablePadding>
      {flatPrompts.map((message, index) => (
        <MessageItem key={index} elevation={0}>
          <RoleChip role={message.role} variant='caption'>
            {message.role.toUpperCase()}
          </RoleChip>
          <Typography
            variant='body2'
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
            }}
          >
            {message.content}
          </Typography>
        </MessageItem>
      ))}
    </List>
  );
}

function PromptTree({ prompts }: { prompts?: IPromptPart[] }): React.ReactElement {
  if (!prompts?.length) {
    return <EmptyState>No prompt tree to display</EmptyState>;
  }

  return (
    <Box>
      {prompts.map(item => <PromptTreeNode key={item.id} node={item} depth={0} />)}
    </Box>
  );
}

function PromptTreeNode({ node, depth }: { node: IPromptPart; depth: number }): React.ReactElement {
  return (
    <TreeItem depth={depth}>
      <Typography variant='subtitle2' color='primary' gutterBottom>
        {node.caption || node.id || 'Prompt'}
      </Typography>
      {node.text && (
        <Typography
          variant='body2'
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            mb: node.children?.length ? 2 : 0,
          }}
        >
          {node.text}
        </Typography>
      )}
      {node.children?.length && node.children.map(child => <PromptTreeNode key={child.id} node={child} depth={depth + 1} />)}
    </TreeItem>
  );
}

interface PromptPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  inputText?: string;
}

export const PromptPreviewDialog: React.FC<PromptPreviewDialogProps> = ({
  open,
  onClose,
  inputText = '',
}) => {
  const { t } = useTranslation('agent');
  const agent = useAgentChatStore(state => state.agent);

  // Use handler config management hook with available agent info
  const { loading: handlerConfigLoading, config: handlerConfig } = useHandlerConfigManagement({
    agentId: agent?.id, // agentId is still used by useHandlerConfigManagement
    agentDefId: agent?.agentDefId,
  });

  const {
    previewDialogTab: tab,
    previewLoading: loading,
    previewResult,
    setPreviewDialogTab,
    getPreviewPromptResult,
  } = useAgentChatStore(
    useShallow((state) => ({
      previewDialogTab: state.previewDialogTab,
      previewLoading: state.previewLoading,
      previewResult: state.previewResult,
      setPreviewDialogTab: state.setPreviewDialogTab,
      getPreviewPromptResult: state.getPreviewPromptResult,
    })),
  );

  useEffect(() => {
    let isMounted = true; // To prevent setting state after unmounting

    const fetchPreview = async () => {
      if (!agent?.agentDefId) {
        console.log('PromptPreviewDialog: Missing agentDefId, skipping preview');
        return;
      }
      if (handlerConfigLoading) {
        console.log('PromptPreviewDialog: Handler config is loading, skipping preview');
        return;
      }
      if (!handlerConfig) {
        console.log('PromptPreviewDialog: No handler config available, skipping preview');
        return;
      }

      console.log('PromptPreviewDialog: Fetching preview with config', {
        agentDefId: agent.agentDefId, // agent is checked for nullity above
        inputTextLength: inputText.length,
        handlerConfigKeys: Object.keys(handlerConfig),
      });

      try {
        const result = await getPreviewPromptResult(inputText, handlerConfig);
        if (isMounted) {
          console.log('PromptPreviewDialog: Preview result received', { success: !!result, flatPromptsCount: result?.flatPrompts.length });
        }
      } catch (error) {
        if (isMounted) {
          console.error('PromptPreviewDialog: Error fetching preview', error);
          // Even if there's an error, the previewLoading state should be reset in the action
        }
      }
    };

    // Only fetch preview when dialog is open
    if (open) {
      console.log('PromptPreviewDialog: Dialog is open, fetching preview...');
      void fetchPreview();
    } else {
      console.log('PromptPreviewDialog: Dialog is closed, skipping preview');
    }

    // Cleanup function to prevent memory leaks and setting state after unmount
    return () => {
      isMounted = false;
    };
  }, [agent?.agentDefId, inputText, handlerConfig, handlerConfigLoading, getPreviewPromptResult, open]);

  const handleTabChange = (_event: React.SyntheticEvent, value: string): void => {
    setPreviewDialogTab(value as 'flat' | 'tree' | 'config');
  };

  const formattedPreview = previewResult
    ? {
      flatPrompts: previewResult.flatPrompts.map((message: CoreMessage) => ({
        role: String(message.role),
        content: getFormattedContent(message.content),
      })),
      processedPrompts: previewResult.processedPrompts,
    }
    : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>
        {t('Prompt.Preview', 'Prompt Preview')}
        <IconButton
          aria-label='close'
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading
          ? (
            <Box
              display='flex'
              flexDirection='column'
              justifyContent='center'
              alignItems='center'
              minHeight={300}
              gap={2}
            >
              <CircularProgress />
              <Typography variant='body2' color='text.secondary'>
                {t('Prompt.Loading', 'Loading preview...')}
              </Typography>
              {/* We still want to show the preview is auto-refreshing based on input text */}
              <Typography variant='caption' color='text.secondary' sx={{ mt: 1, maxWidth: '80%', textAlign: 'center' }}>
                {t('Prompt.AutoRefresh', 'Preview will automatically refresh when input text changes')}
              </Typography>
            </Box>
          )
          : (
            <TabContext value={tab}>
              <PreviewTabs
                value={tab}
                onChange={handleTabChange}
                aria-label='prompt preview tabs'
                variant='fullWidth'
              >
                <Tab
                  label={t('Prompt.Flat', 'Flat Result')}
                  value='flat'
                  sx={{ textTransform: 'none' }}
                />
                <Tab
                  label={t('Prompt.Tree', 'Tree Result')}
                  value='tree'
                  sx={{ textTransform: 'none' }}
                />
                <Tab
                  label={t('Prompt.Config', 'Configuration')}
                  value='config'
                  sx={{ textTransform: 'none' }}
                />
              </PreviewTabs>

              {/* Flat Result Tab */}
              <TabPanel value='flat' sx={{ p: 0 }}>
                <PreviewContent>
                  <FlatPromptList flatPrompts={formattedPreview?.flatPrompts} />
                </PreviewContent>
              </TabPanel>

              {/* Tree Result Tab */}
              <TabPanel value='tree' sx={{ p: 0 }}>
                <PreviewContent>
                  <PromptTree prompts={formattedPreview?.processedPrompts} />
                </PreviewContent>
              </TabPanel>

              {/* Configuration Tab */}
              <TabPanel value='config' sx={{ p: 0 }}>
                <PromptConfigForm
                  agentDefId={agent?.agentDefId}
                />
              </TabPanel>
            </TabContext>
          )}
      </DialogContent>
    </Dialog>
  );
};
