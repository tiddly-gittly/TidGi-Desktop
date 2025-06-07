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

  // Use handler config management hook with both agent definition ID and agent ID
  // This ensures we get instance-level config that can be properly updated
  const {
    loading: handlerConfigLoading,
    config: handlerConfig,
    schema: handlerSchema,
    handleConfigChange,
  } = useHandlerConfigManagement({
    agentDefId: agent?.agentDefId,
    agentId: agent?.id, // Add agent ID to ensure instance-level config consistency
  });

  // Local config state to prevent form rerender when saving
  const [localHandlerConfig, setLocalHandlerConfig] = useState<HandlerConfig | undefined>(undefined);

  // Keep local config in sync with remote config but don't update local when it's being edited
  const isEditingRef = useRef(false);
  const lastSavedConfigRef = useRef<HandlerConfig | undefined>(undefined);

  useEffect(() => {
    // Only update local config if we're not currently editing and the config actually changed
    if (
      !isEditingRef.current && handlerConfig &&
      JSON.stringify(handlerConfig) !== JSON.stringify(lastSavedConfigRef.current)
    ) {
      setLocalHandlerConfig(handlerConfig);
      lastSavedConfigRef.current = handlerConfig;
    }
  }, [handlerConfig]);

  // Initialize local config when component mounts
  useEffect(() => {
    if (handlerConfig && !localHandlerConfig) {
      setLocalHandlerConfig(handlerConfig);
      lastSavedConfigRef.current = handlerConfig;
    }
  }, [handlerConfig, localHandlerConfig]);

  const {
    previewDialogTab: tab,
    previewLoading,
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

  // Debounced save timeout for background persistence
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Handle local config changes (immediate for preview, debounced for persistence)
  const handleLocalConfigChange = useCallback((newConfig: HandlerConfig) => {
    // Update local state immediately for UI responsiveness
    setLocalHandlerConfig(newConfig);
    isEditingRef.current = true;

    // Clear existing save timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new debounced save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await handleConfigChange(newConfig);
        lastSavedConfigRef.current = newConfig;
      } catch (error) {
        console.error('PromptPreviewDialog: Error auto-saving config:', error);
      } finally {
        setTimeout(() => {
          isEditingRef.current = false;
        }, 500);
      }
    }, 1000); // 1 second debounce
  }, [handleConfigChange]);

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
      if (!localHandlerConfig) {
        console.log('PromptPreviewDialog: No handler config available, skipping preview');
        return;
      }

      try {
        const result = await getPreviewPromptResult(inputText, localHandlerConfig);
        if (isMounted) {
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
      void fetchPreview();
    }
    // Cleanup function to prevent memory leaks and setting state after unmount
    return () => {
      isMounted = false;
    };
  }, [agent?.agentDefId, inputText, localHandlerConfig, handlerConfigLoading, getPreviewPromptResult, open]);
 
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

  const handleFormChange = useCallback((updatedConfig: HandlerConfig) => {
    // Log changes for debugging
    console.log('Form data changed', {
      configKeys: Object.keys(updatedConfig),
    });

    // Update local config and trigger preview update
    handleLocalConfigChange(updatedConfig);

    // Always update preview with new config
    if (agent?.agentDefId && !handlerConfigLoading) {
      void getPreviewPromptResult(inputText, updatedConfig).then(result => {
        if (result) {
          setPreviewStatus({
            lastUpdated: new Date(),
            source: 'auto',
          });
        }
      });
    }
  }, [agent?.agentDefId, getPreviewPromptResult, inputText, handlerConfigLoading, handleLocalConfigChange]);

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

  const renderDialogContent = () => {
    if (previewLoading) {
      return <LoadingView />;
    }

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
          handlerSchema={handlerSchema ?? {}}
          initialHandlerConfig={localHandlerConfig || undefined}
          handleFormChange={handleFormChange}
          previewLoading={previewLoading}
          handlerConfigLoading={handlerConfigLoading}
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Box>{t('Prompt.Preview')}</Box>
          <Box sx={{ display: 'flex' }}>
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
        </Box>
      </DialogTitle>
      <DialogContent
        sx={{
          ...(isFullScreen && {
            padding: 0,
            overflow: 'hidden',
            height: 'calc(100vh - 64px)',
          }),
        }}
      >
        {renderDialogContent()}
      </DialogContent>
    </Dialog>
  );
});
