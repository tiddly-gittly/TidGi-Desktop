import { useHandlerConfigManagement } from '@/windows/Preferences/sections/ExternalAPI/useHandlerConfigManagement';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import MuiDialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { PreviewProgressBar } from '../../../Agent/components/PreviewDialog/PreviewProgressBar';
import { useAgentChatStore } from '../../../Agent/store/agentChatStore/index';
import { EditView } from './EditView';
import { PreviewTabsView } from './PreviewTabsView';

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

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const {
    loading: handlerConfigLoading,
    config: handlerConfig,
  } = useHandlerConfigManagement({
    agentDefId: agent?.agentDefId,
    agentId: agent?.id,
  });

  const {
    getPreviewPromptResult,
    previewLoading,
  } = useAgentChatStore(
    useShallow((state) => ({
      getPreviewPromptResult: state.getPreviewPromptResult,
      previewLoading: state.previewLoading,
    })),
  );
  useEffect(() => {
    const fetchInitialPreview = async () => {
      if (!agent?.agentDefId || handlerConfigLoading || !handlerConfig || !open) {
        return;
      }
      try {
        await getPreviewPromptResult(inputText, handlerConfig);
      } catch (error) {
        console.error('PromptPreviewDialog: Error fetching initial preview:', error);
      }
    };
    void fetchInitialPreview();
  }, [agent?.agentDefId, handlerConfig, handlerConfigLoading, inputText, open]); // 移除 getPreviewPromptResult

  const handleToggleFullScreen = useCallback((): void => {
    setIsFullScreen(previous => !previous);
  }, []);

  const handleToggleEditMode = useCallback((): void => {
    setIsEditMode(previous => !previous);
  }, []);

  // Listen for form field scroll targets to automatically switch to edit mode
  const { formFieldsToScrollTo } = useAgentChatStore(
    useShallow((state) => ({
      formFieldsToScrollTo: state.formFieldsToScrollTo,
    })),
  );
  useEffect(() => {
    if (formFieldsToScrollTo.length > 0) {
      setIsEditMode(true);
    }
  }, [formFieldsToScrollTo]);

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
      <MuiDialogContent
        sx={{
          ...(isFullScreen && {
            padding: 0,
            overflow: 'hidden',
            height: 'calc(100vh - 64px)',
          }),
        }}
      >
        <PreviewProgressBar show={previewLoading} />
        {isEditMode
          ? (
            <Box sx={{ display: 'flex', gap: 2, height: isFullScreen ? '100%' : '70vh' }}>
              <Box
                sx={{
                  flex: '1',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <PreviewTabsView
                  isFullScreen={isFullScreen}
                />
              </Box>
              <Box
                sx={{
                  flex: '0 0 50%',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <EditView
                  isFullScreen={isFullScreen}
                  inputText={inputText}
                />
              </Box>
            </Box>
          )
          : (
            <PreviewTabsView
              isFullScreen={isFullScreen}
            />
          )}
      </MuiDialogContent>
    </Dialog>
  );
};
