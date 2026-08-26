import { useAgentFrameworkConfigManagement } from '@/windows/Preferences/sections/ExternalAPI/useAgentFrameworkConfigManagement';
import ArticleIcon from '@mui/icons-material/Article';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SaveIcon from '@mui/icons-material/Save';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import MuiDialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import type { PromptPreviewController, PromptPreviewDialogState } from 'memeloop';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditView } from './EditView';
import { PreviewProgressBar } from './PreviewProgressBar';
import { PreviewTabsView } from './PreviewTabsView';

export interface PromptPreviewDialogProps {
  agentId: string;
  agentDefinitionId: string;
  state: PromptPreviewDialogState;
  controller: PromptPreviewController;
  open: boolean;
  onClose: () => void;
  inputText?: string;
  initialBaseMode?: 'preview' | 'edit';
}

export const PromptPreviewDialog: React.FC<PromptPreviewDialogProps> = ({
  agentId,
  agentDefinitionId,
  state,
  controller,
  open,
  onClose,
  inputText = '',
  initialBaseMode = 'preview',
}) => {
  const { t } = useTranslation('agent');

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [baseMode, setBaseMode] = useState<'preview' | 'edit'>(initialBaseMode);
  const [showSideBySide, setShowSideBySide] = useState(false);
  const [baseModeBeforeSideBySide, setBaseModeBeforeSideBySide] = useState<'preview' | 'edit'>(initialBaseMode);
  const [savedSnackbarOpen, setSavedSnackbarOpen] = useState(false);

  const {
    loading: agentFrameworkConfigLoading,
    config: agentFrameworkConfig,
  } = useAgentFrameworkConfigManagement({
    agentDefId: agentDefinitionId,
    agentId,
  });

  /** Copy current instance prompt config to the agent definition */
  const handleSaveToDefinition = useCallback(async () => {
    if (!agentFrameworkConfig) return;
    try {
      const agentDefinition = await window.service.agentDefinition.getAgentDef(agentDefinitionId);
      if (agentDefinition) {
        await window.service.agentDefinition.updateAgentDef({
          ...agentDefinition,
          agentFrameworkConfig,
        });
        setSavedSnackbarOpen(true);
      }
    } catch (error) {
      void window.service.native.log('error', 'Failed to save config to definition', { error });
    }
  }, [agentDefinitionId, agentFrameworkConfig]);

  useEffect(() => {
    if (agentFrameworkConfigLoading || !agentFrameworkConfig || !open) return;
    void controller.generate(
      agentFrameworkConfig,
      agentId,
      inputText.trim().length === 0 ? undefined : inputText,
    );
  }, [agentFrameworkConfig, agentFrameworkConfigLoading, agentId, controller, inputText, open]);

  const handleToggleFullScreen = useCallback((): void => {
    setIsFullScreen(previous => !previous);
  }, []);

  const handleToggleEditMode = useCallback((): void => {
    setShowSideBySide(previous => {
      if (!previous) {
        // Entering side-by-side, save current baseMode
        setBaseModeBeforeSideBySide(baseMode);
      } else {
        // Exiting side-by-side, restore previous baseMode
        setBaseMode(baseModeBeforeSideBySide);
      }
      return !previous;
    });
  }, [baseMode, baseModeBeforeSideBySide]);

  // Listen for form field scroll targets to automatically switch to side-by-side mode
  const { formFieldsToScrollTo } = state;
  useEffect(() => {
    if (formFieldsToScrollTo.length > 0) {
      // Save current baseMode before switching to side-by-side
      setBaseModeBeforeSideBySide(baseMode);
      setBaseMode('edit');
      setShowSideBySide(true); // Show side-by-side when clicking from PromptTree
    }
  }, [formFieldsToScrollTo, baseMode]);

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
            {/* Save to definition button — only in edit mode */}
            {(showEdit || showSideBySide) && (
              <Tooltip title={t('Preference.SaveToDefinition')}>
                <IconButton
                  aria-label={t('Preference.SaveToDefinition')}
                  onClick={() => {
                    void handleSaveToDefinition();
                  }}
                  sx={{ mr: 1 }}
                  data-testid='save-to-definition-button'
                >
                  <SaveIcon />
                </IconButton>
              </Tooltip>
            )}
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
              aria-label={isFullScreen ? t('Prompt.ExitFullScreen') : t('Prompt.EnterFullScreen')}
              onClick={handleToggleFullScreen}
              sx={{ mr: 1 }}
              title={isFullScreen ? t('Prompt.ExitFullScreen') : t('Prompt.EnterFullScreen')}
            >
              {isFullScreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
            <IconButton
              aria-label={t('Prompt.Close')}
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
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              gap: 2,
              height: isFullScreen ? '100%' : '70vh',
              overflow: 'auto',
            }}
          >
            <Box
              sx={{
                flex: '1',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 240,
              }}
            >
              <PreviewProgressBar show={state.loading} state={state} />
              <PreviewTabsView
                isFullScreen={isFullScreen}
                state={state}
                controller={controller}
              />
            </Box>
            <Box
              sx={{
                flex: { xs: '1 0 320px', md: '0 0 50%' },
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 320,
              }}
            >
              <EditView
                isFullScreen={isFullScreen}
                inputText={inputText}
                agentId={agentId}
                agentDefinitionId={agentDefinitionId}
                state={state}
                controller={controller}
              />
            </Box>
          </Box>
        )}

        {showPreview && !showEdit && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: isFullScreen ? '100%' : '70vh' }}>
            <PreviewProgressBar show={state.loading} state={state} />
            <PreviewTabsView
              isFullScreen={isFullScreen}
              state={state}
              controller={controller}
            />
          </Box>
        )}

        {showEdit && !showPreview && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: isFullScreen ? '100%' : '70vh' }}>
            <EditView
              isFullScreen={isFullScreen}
              inputText={inputText}
              agentId={agentId}
              agentDefinitionId={agentDefinitionId}
              state={state}
              controller={controller}
            />
          </Box>
        )}
      </MuiDialogContent>
      <Snackbar
        open={savedSnackbarOpen}
        autoHideDuration={2000}
        onClose={() => {
          setSavedSnackbarOpen(false);
        }}
        message={t('Preference.SaveToDefinitionDescription')}
      />
    </Dialog>
  );
};
