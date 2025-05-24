/* eslint-disable unicorn/prevent-abbreviations */
import { useHandlerConfigManagement } from '@/pages/Preferences/sections/ExternalAPI/useHandlerConfigManagement';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { AgentInstance } from '@services/agentInstance/interface';
import { HandlerConfig } from '@services/agentInstance/promptConcat/promptConcatSchema';
import { CoreMessage } from 'ai';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../../../../../store/agentChatStore/index';
import { getFormattedContent } from '../types';
import { DialogTabTypes } from './constants';
import { LoadingView } from './LoadingView';
import { PreviewTabsView } from './PreviewTabsView';
import { SideBySideEditView } from './SideBySideEditView';

// Constants
const DEBOUNCE_DELAY = 500; // ms

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

      console.log(handlerSchema);

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
  }, [agent?.agentDefId, inputText, handlerConfig, handlerConfigLoading, getPreviewPromptResult, open]);

  // Track preview update status
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
    // Only handle flat and tree tabs for preview - edit mode has its own tab system
    if (value === DialogTabTypes.FLAT || value === DialogTabTypes.TREE) {
      setPreviewDialogTab(value);
    } else {
      // If invalid tab received, default to flat
      setPreviewDialogTab(DialogTabTypes.FLAT);
    }
  }, [setPreviewDialogTab]);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // 并排编辑模式

  const handleToggleFullScreen = useCallback((): void => {
    setIsFullScreen(prev => !prev);
  }, []);

  const handleToggleEditMode = useCallback((): void => {
    setIsEditMode(prev => !prev);
  }, []);

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

  /**
   * 条件渲染函数，根据当前状态返回适当的组件
   */
  const renderDialogContent = () => {
    // 如果在加载中，显示加载组件
    if (previewLoading) {
      return <LoadingView />;
    }

    // 如果在编辑模式，显示并排视图
    if (isEditMode) {
      return (
        <SideBySideEditView
          tab={tab}
          handleTabChange={handleTabChange}
          isFullScreen={isFullScreen}
          flatPrompts={formattedPreview?.flatPrompts}
          processedPrompts={formattedPreview?.processedPrompts}
          lastUpdated={previewStatus.lastUpdated}
          updateSource={previewStatus.source}
          agent={agent || undefined}
          handlerSchema={handlerSchema || {}}
          handlerConfig={handlerConfig || undefined}
          handleConfigUpdate={handleConfigUpdate}
          handleFormChange={handleFormChange}
          handleManualRefresh={handleManualRefresh}
          previewLoading={previewLoading}
          handlerConfigLoading={handlerConfigLoading}
          autoUpdateEnabled={autoUpdateEnabled}
          handleAutoUpdateToggle={handleAutoUpdateToggle}
        />
      );
    }

    // Display simplified preview tabs (only flat and tree tabs)
    // Since store types are constrained to flat|tree, tab is always valid
    return (
      <PreviewTabsView
        tab={tab}
        handleTabChange={handleTabChange}
        isFullScreen={isFullScreen}
        flatPrompts={formattedPreview?.flatPrompts}
        processedPrompts={formattedPreview?.processedPrompts}
        lastUpdated={previewStatus.lastUpdated}
        updateSource={previewStatus.source}
      />
    );
  };

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
        {renderDialogContent()}
      </DialogContent>
    </Dialog>
  );
});
