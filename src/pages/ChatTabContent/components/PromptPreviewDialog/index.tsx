import { useAgentFrameworkConfigManagement } from '@/windows/Preferences/sections/ExternalAPI/useAgentFrameworkConfigManagement';
import ArticleIcon from '@mui/icons-material/Article';
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
import { useAgentChatStore } from '../../../Agent/store/agentChatStore/index';
import { EditView } from './EditView';
import { PreviewProgressBar } from './PreviewProgressBar';
import { PreviewTabsView } from './PreviewTabsView';

interface PromptPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  inputText?: string;
  initialBaseMode?: 'preview' | 'edit';
}

export const PromptPreviewDialog: React.FC<PromptPreviewDialogProps> = ({
  open,
  onClose,
  inputText = '',
  initialBaseMode = 'preview',
}) => {
  const { t } = useTranslation('agent');
  const agent = useAgentChatStore(state => state.agent);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [baseMode, setBaseMode] = useState<'preview' | 'edit'>(initialBaseMode);
  const [showSideBySide, setShowSideBySide] = useState(false);

  const {
    loading: agentFrameworkConfigLoading,
    config: agentFrameworkConfig,
  } = useAgentFrameworkConfigManagement({
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
      if (!agent?.agentDefId || agentFrameworkConfigLoading || !agentFrameworkConfig || !open) {
        return;
      }
      try {
        await getPreviewPromptResult(inputText, agentFrameworkConfig);
      } catch (error) {
        console.error('PromptPreviewDialog: Error fetching initial preview:', error);
      }
    };
    void fetchInitialPreview();
  }, [agent?.agentDefId, agentFrameworkConfig, agentFrameworkConfigLoading, inputText, open]); // 移除 getPreviewPromptResult

  const handleToggleFullScreen = useCallback((): void => {
    setIsFullScreen(previous => !previous);
  }, []);

  const handleToggleEditMode = useCallback((): void => {
    setShowSideBySide(previous => !previous);
  }, []);

  // Listen for form field scroll targets to automatically switch to edit mode
  const { formFieldsToScrollTo } = useAgentChatStore(
    useShallow((state) => ({
      formFieldsToScrollTo: state.formFieldsToScrollTo,
    })),
  );
  useEffect(() => {
    if (formFieldsToScrollTo.length > 0) {
      setBaseMode('edit');
      setShowSideBySide(false);
    }
  }, [formFieldsToScrollTo]);

  useEffect(() => {
    if (open) {
      setBaseMode(initialBaseMode);
      setShowSideBySide(false);
    }
  }, [initialBaseMode, open]);

  const showPreview = showSideBySide || baseMode === 'preview';
  const showEdit = showSideBySide || baseMode === 'edit';
  const isSideBySide = showSideBySide;

  const sideBySideTooltip = isSideBySide
    ? t('Prompt.ExitSideBySide')
    : baseMode === 'edit'
    ? t('Prompt.EnterPreviewSideBySide')
    : t('Prompt.EnterEditSideBySide');

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
            <Tooltip title={sideBySideTooltip}>
              <IconButton
                aria-label={sideBySideTooltip}
                onClick={handleToggleEditMode}
                sx={{ mr: 1 }}
                color={isSideBySide ? 'primary' : 'default'}
              >
                {isSideBySide ? <ViewSidebarIcon /> : baseMode === 'edit' ? <ArticleIcon /> : <EditIcon />}
              </IconButton>
            </Tooltip>
            <IconButton
              aria-label='toggle-fullscreen'
              onClick={handleToggleFullScreen}
              sx={{ mr: 1 }}
              title={isFullScreen ? t('Prompt.ExitFullScreen') : t('Prompt.EnterFullScreen')}
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
        {showPreview && showEdit && (
          <Box sx={{ display: 'flex', gap: 2, height: isFullScreen ? '100%' : '70vh' }}>
            <Box
              sx={{
                flex: '1',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <PreviewProgressBar show={previewLoading} />
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
        )}

        {showPreview && !showEdit && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: isFullScreen ? '100%' : '70vh' }}>
            <PreviewProgressBar show={previewLoading} />
            <PreviewTabsView
              isFullScreen={isFullScreen}
            />
          </Box>
        )}

        {showEdit && !showPreview && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: isFullScreen ? '100%' : '70vh' }}>
            <EditView
              isFullScreen={isFullScreen}
              inputText={inputText}
            />
          </Box>
        )}
      </MuiDialogContent>
    </Dialog>
  );
};
