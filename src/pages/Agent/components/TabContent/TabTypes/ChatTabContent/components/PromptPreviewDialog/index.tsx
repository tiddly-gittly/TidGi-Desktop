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

export const PromptPreviewDialog: React.FC<PromptPreviewDialogProps> = ({
  open,
  onClose,
  inputText = '',
}) => {
  const { t } = useTranslation('agent');
  const agent = useAgentChatStore(state => state.agent);

  const {
    loading: handlerConfigLoading,
    config: handlerConfig,
    schema: handlerSchema,
    handleConfigChange,
  } = useHandlerConfigManagement({
    agentDefId: agent?.agentDefId,
    agentId: agent?.id,
  });

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

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleFormChange = useCallback((updatedConfig: HandlerConfig) => {
    console.log('Form data changed', {
      configKeys: Object.keys(updatedConfig),
    });

    // Clear existing save timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounced save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await handleConfigChange(updatedConfig);
        // Update preview with new config after save
        if (agent?.agentDefId) {
          void getPreviewPromptResult(inputText, updatedConfig).then(result => {
            if (result) {
              setLastUpdated(new Date());
            }
          });
        }
      } catch (error) {
        console.error('PromptPreviewDialog: Error auto-saving config:', error);
      }
    }, 1000);
  }, [handleConfigChange, agent?.agentDefId, getPreviewPromptResult, inputText]);

  useEffect(() => {
    let isMounted = true;

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

      try {
        const result = await getPreviewPromptResult(inputText, handlerConfig);
        if (isMounted && result) {
          setLastUpdated(new Date());
        }
      } catch (error) {
        if (isMounted) {
          console.error('PromptPreviewDialog: Error fetching preview', error);
        }
      }
    };

    if (open) {
      void fetchPreview();
    }

    return () => {
      isMounted = false;
    };
  }, [agent?.agentDefId, inputText, handlerConfig, handlerConfigLoading, getPreviewPromptResult, open]);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!open) {
      setLastUpdated(null);
    }
  }, [open]);

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
          lastUpdated={lastUpdated}
          handlerSchema={handlerSchema ?? {}}
          initialConfig={handlerConfig}
          handleFormChange={handleFormChange}
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
        lastUpdated={lastUpdated}
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
};
