/* eslint-disable unicorn/prevent-abbreviations */
import { useHandlerConfigManagement } from '@/pages/Preferences/sections/ExternalAPI/useHandlerConfigManagement';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import RefreshIcon from '@mui/icons-material/Refresh';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import { TabContext, TabPanel } from '@mui/lab';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import Paper from '@mui/material/Paper';
import { styled } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { AgentInstance } from '@services/agentInstance/interface';
import { IPromptPart } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { CoreMessage } from 'ai';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../../../../store/agentChatStore/index';
import { LastUpdatedIndicator } from './LastUpdatedIndicator';
import { PromptConfigForm } from './PromptConfigForm';

// Constants
const DEBOUNCE_DELAY = 500; // ms

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

const PreviewContent = styled(Paper, {
  shouldForwardProp: (property: string) => property !== 'isFullScreen',
})<{ isFullScreen?: boolean }>(({ theme, isFullScreen }) => ({
  background: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(2),
  minHeight: 240,
  maxHeight: isFullScreen ? 'calc(100vh - 150px)' : '60vh',
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

// Memoized child components for better performance
const FlatPromptList = React.memo(({ flatPrompts }: { flatPrompts?: PreviewMessage[] }): React.ReactElement => {
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
});

const PromptTree = React.memo(({ prompts }: { prompts?: IPromptPart[] }): React.ReactElement => {
  if (!prompts?.length) {
    return <EmptyState>No prompt tree to display</EmptyState>;
  }

  return (
    <Box>
      {prompts.map(item => <PromptTreeNode key={item.id} node={item} depth={0} />)}
    </Box>
  );
});

const PromptTreeNode = React.memo(({ node, depth }: { node: IPromptPart; depth: number }): React.ReactElement => {
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
});

interface PromptPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  inputText?: string;
}

export const PromptPreviewDialog: React.FC<PromptPreviewDialogProps> = React.memo(({
  open,
  onClose,
  inputText = '',
}) => {
  const { t } = useTranslation('agent');
  const agent = useAgentChatStore(state => state.agent);

  // Use handler config management hook with agent definition ID only - no need for agentId
  const {
    loading: handlerConfigLoading,
    config: handlerConfig,
    schema: handlerSchema,
  } = useHandlerConfigManagement({
    agentDefId: agent?.agentDefId,
  });

  const {
    previewDialogTab: tab,
    previewLoading,
    previewResult,
    setPreviewDialogTab,
    getPreviewPromptResult,
    updateAgent,
  } = useAgentChatStore(
    useShallow((state) => ({
      previewDialogTab: state.previewDialogTab,
      previewLoading: state.previewLoading,
      previewResult: state.previewResult,
      setPreviewDialogTab: state.setPreviewDialogTab,
      getPreviewPromptResult: state.getPreviewPromptResult,
      updateAgent: state.updateAgent,
    })),
  );

  // Memoized event handlers to prevent unnecessary re-renders
  const handleConfigUpdate = useCallback(async (data: Partial<AgentInstance>) => {
    try {
      await updateAgent(data);
    } catch (error) {
      console.error('PromptPreviewDialog: Error updating agent config:', error);
    }
  }, [updateAgent]);

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
        agentDefId: agent.agentDefId,
        inputTextLength: inputText.length,
        handlerConfigKeys: Object.keys(handlerConfig),
        hasSchema: !!handlerSchema,
      });

      try {
        const result = await getPreviewPromptResult(inputText, handlerConfig);
        if (isMounted) {
          console.log('PromptPreviewDialog: Preview result received', { success: !!result, flatPromptsCount: result?.flatPrompts.length });

          // Update initial preview status
          if (result) {
            setPreviewStatus({
              lastUpdated: new Date(),
              source: 'initial',
            });
          }
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
  }, [agent?.agentDefId, inputText, handlerConfig, handlerConfigLoading, getPreviewPromptResult, open]); // Track preview update status
  const [previewStatus, setPreviewStatus] = useState<{
    lastUpdated: Date | null;
    source: 'auto' | 'manual' | 'initial' | null;
  }>({
    lastUpdated: null,
    source: null,
  });

  // Reset preview status when dialog closes
  useEffect(() => {
    if (!open) {
      // Reset status if dialog is closed
      setPreviewStatus({
        lastUpdated: null,
        source: null,
      });
    }
  }, [open]);

  // Create manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    if (!agent?.agentDefId || !handlerConfig || handlerConfigLoading) {
      console.log('PromptPreviewDialog: Cannot refresh - missing agentDefId, config, or config is loading');
      return;
    }

    try {
      console.log('PromptPreviewDialog: Manually refreshing preview');
      const result = await getPreviewPromptResult(inputText, handlerConfig);

      // Update preview status on successful refresh
      if (result) {
        setPreviewStatus({
          lastUpdated: new Date(),
          source: 'manual',
        });
      }
    } catch (error) {
      console.error('PromptPreviewDialog: Error during manual refresh:', error);
    }
  }, [agent?.agentDefId, handlerConfig, handlerConfigLoading, getPreviewPromptResult, inputText]);

  // Handle form change to optionally update preview in real-time
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);

  // Memoized auto-update toggle handler
  const handleAutoUpdateToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setAutoUpdateEnabled(event.target.checked);
  }, []);

  // Cleanup timeout when component unmounts
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, []);

  const handleFormChange = useCallback((updatedConfig: HandlerConfig) => {
    // Log changes for debugging
    console.log('Form data changed', {
      autoUpdateEnabled,
      configKeys: Object.keys(updatedConfig),
    });

    // Use a debounced update to prevent too frequent preview refreshes
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (autoUpdateEnabled && agent?.agentDefId && !handlerConfigLoading) {
      // Set a timeout to update the preview after user stops typing
      debounceTimeoutRef.current = setTimeout(async () => {
        try {
          console.log('PromptPreviewDialog: Auto-updating preview with new config');
          const result = await getPreviewPromptResult(inputText, updatedConfig);

          // Update preview status on successful auto-update
          if (result) {
            setPreviewStatus({
              lastUpdated: new Date(),
              source: 'auto',
            });
          }
        } catch (error) {
          console.error('PromptPreviewDialog: Error auto-updating preview:', error);
        }
      }, DEBOUNCE_DELAY);
    }
  }, [autoUpdateEnabled, agent?.agentDefId, getPreviewPromptResult, inputText, handlerConfigLoading]);

  // Handle tab change in the preview dialog
  const handleTabChange = useCallback((_event: React.SyntheticEvent, value: string): void => {
    setPreviewDialogTab(value as 'flat' | 'tree' | 'config');
  }, [setPreviewDialogTab]);

  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const [isEditMode, setIsEditMode] = React.useState(false); // New state for side-by-side editing

  const handleToggleFullScreen = useCallback((): void => {
    setIsFullScreen(prev => !prev);
  }, []);

  const handleToggleEditMode = useCallback((): void => {
    setIsEditMode(prev => !prev);
    // When entering edit mode, switch to config tab for better user experience
    if (!isEditMode) {
      setPreviewDialogTab('config');
    }
  }, [isEditMode, setPreviewDialogTab]);

  // Memoize formatted preview to prevent unnecessary recalculations
  const formattedPreview = useMemo(() => {
    return previewResult
      ? {
        flatPrompts: previewResult.flatPrompts.map((message: CoreMessage) => ({
          role: String(message.role),
          content: getFormattedContent(message.content),
        })),
        processedPrompts: previewResult.processedPrompts,
      }
      : null;
  }, [previewResult]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={isFullScreen ? false : 'md'}
      fullWidth
      fullScreen={isFullScreen}
      slotProps={{
        paper: {
          sx: {
            ...(isFullScreen && {
              m: 0,
              width: '100%',
              height: '100%',
              maxHeight: '100%',
              maxWidth: '100%',
              borderRadius: 0,
            }),
          },
        },
      }}
    >
      <DialogTitle>
        {t('Prompt.Preview')}
        <Box sx={{ position: 'absolute', right: 8, top: 8, display: 'flex' }}>
          <Tooltip title={t(isEditMode ? 'Prompt.ExitEditMode' : 'Prompt.EnterEditMode', isEditMode ? 'Exit side-by-side editing' : 'Enter side-by-side editing')}>
            <IconButton
              aria-label='toggle-edit-mode'
              onClick={handleToggleEditMode}
              sx={{ mr: 1 }}
              color={isEditMode ? 'primary' : 'default'}
            >
              {isEditMode ? <ViewSidebarIcon /> : <EditIcon />}
            </IconButton>
          </Tooltip>
          <IconButton
            aria-label='toggle-fullscreen'
            onClick={handleToggleFullScreen}
            sx={{ mr: 1 }}
            title={t(isFullScreen ? 'Prompt.ExitFullScreen' : 'Prompt.EnterFullScreen')}
          >
            {isFullScreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
          <IconButton
            aria-label='close'
            onClick={onClose}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {previewLoading
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
                {t('Prompt.Loading')}
              </Typography>
              {/* We still want to show the preview is auto-refreshing based on input text */}
              <Typography variant='caption' color='text.secondary' sx={{ mt: 1, maxWidth: '80%', textAlign: 'center' }}>
                {t('Prompt.AutoRefresh')}
              </Typography>
            </Box>
          )
          : isEditMode
          ? (
            // Side-by-side editing layout
            <Box sx={{ display: 'flex', gap: 2, height: isFullScreen ? 'calc(100vh - 150px)' : '70vh' }}>
              {/* Configuration Panel */}
              <Box
                sx={{
                  flex: '0 0 50%',
                  borderRight: 1,
                  borderColor: 'divider',
                  pr: 2,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant='h6' sx={{ fontSize: '1rem' }}>
                    {t('Prompt.Configuration')}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Tooltip title={t('Prompt.RefreshPreview', 'Manually refresh preview')}>
                      <IconButton
                        size='small'
                        onClick={handleManualRefresh}
                        disabled={previewLoading || handlerConfigLoading}
                        sx={{ mr: 1 }}
                      >
                        <RefreshIcon fontSize='small' />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title={t('Prompt.AutoUpdatePreview', 'Auto-update preview on form changes')}>
                      <FormControlLabel
                        control={
                          <Switch
                            size='small'
                            checked={autoUpdateEnabled}
                            onChange={handleAutoUpdateToggle}
                            color='primary'
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <AutorenewIcon fontSize='small' sx={{ mr: 0.5 }} />
                            <Typography variant='caption'>{t('Prompt.AutoUpdate', 'Auto')}</Typography>
                          </Box>
                        }
                        labelPlacement='start'
                        sx={{ mx: 1, my: 0 }}
                      />
                    </Tooltip>
                  </Box>
                </Box>

                <Box sx={{ flex: 1, overflow: 'auto' }}>
                  {agent && (
                    <PromptConfigForm
                      schema={handlerSchema || {}}
                      formData={handlerConfig || undefined}
                      onUpdate={handleConfigUpdate}
                      onChange={handleFormChange}
                      disabled={previewLoading}
                      loading={handlerConfigLoading}
                      showSubmitButton={false} // Hide submit button in side-by-side mode
                    />
                  )}
                </Box>
              </Box>

              {/* Preview Panel */}
              <Box
                sx={{
                  flex: '1',
                  pl: 2,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <TabContext value={tab === 'config' ? 'flat' : tab}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <PreviewTabs
                      value={tab === 'config' ? 'flat' : tab}
                      onChange={handleTabChange}
                      aria-label='prompt preview tabs'
                      variant='fullWidth'
                      sx={{ flex: 1 }}
                    >
                      <Tab
                        label={t('Prompt.Flat')}
                        value='flat'
                        sx={{ textTransform: 'none' }}
                      />
                      <Tab
                        label={t('Prompt.Tree')}
                        value='tree'
                        sx={{ textTransform: 'none' }}
                      />
                    </PreviewTabs>
                  </Box>

                  {/* Flat Result Tab */}
                  <TabPanel value='flat' sx={{ p: 0, flex: 1, overflow: 'hidden' }}>
                    <PreviewContent isFullScreen={isFullScreen}>
                      <FlatPromptList flatPrompts={formattedPreview?.flatPrompts} />
                      <LastUpdatedIndicator lastUpdated={previewStatus.lastUpdated} source={previewStatus.source} />
                    </PreviewContent>
                  </TabPanel>

                  {/* Tree Result Tab */}
                  <TabPanel value='tree' sx={{ p: 0, flex: 1, overflow: 'hidden' }}>
                    <PreviewContent isFullScreen={isFullScreen}>
                      <PromptTree prompts={formattedPreview?.processedPrompts} />
                      <LastUpdatedIndicator lastUpdated={previewStatus.lastUpdated} source={previewStatus.source} />
                    </PreviewContent>
                  </TabPanel>
                </TabContext>
              </Box>
            </Box>
          )
          : (
            // Original tab-based layout
            <TabContext value={tab}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <PreviewTabs
                  value={tab}
                  onChange={handleTabChange}
                  aria-label='prompt preview tabs'
                  variant='fullWidth'
                  sx={{ flex: 1 }}
                >
                  <Tab
                    label={t('Prompt.Flat')}
                    value='flat'
                    sx={{ textTransform: 'none' }}
                  />
                  <Tab
                    label={t('Prompt.Tree')}
                    value='tree'
                    sx={{ textTransform: 'none' }}
                  />
                </PreviewTabs>
              </Box>

              {/* Flat Result Tab */}
              <TabPanel value='flat' sx={{ p: 0 }}>
                <PreviewContent isFullScreen={isFullScreen}>
                  <FlatPromptList flatPrompts={formattedPreview?.flatPrompts} />
                  <LastUpdatedIndicator lastUpdated={previewStatus.lastUpdated} source={previewStatus.source} />
                </PreviewContent>
              </TabPanel>

              {/* Tree Result Tab */}
              <TabPanel value='tree' sx={{ p: 0 }}>
                <PreviewContent isFullScreen={isFullScreen}>
                  <PromptTree prompts={formattedPreview?.processedPrompts} />
                  <LastUpdatedIndicator lastUpdated={previewStatus.lastUpdated} source={previewStatus.source} />
                </PreviewContent>
              </TabPanel>
            </TabContext>
          )}
      </DialogContent>
    </Dialog>
  );
});
