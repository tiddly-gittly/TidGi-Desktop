import { useAgentFrameworkConfigManagement } from '@/windows/Preferences/sections/ExternalAPI/useAgentFrameworkConfigManagement';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import MuiDialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import type { PromptPreviewController, PromptPreviewDialogState } from 'memeloop';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Render as the content of the dedicated BrowserWindow. */
  windowed?: boolean;
}

export interface PromptPreviewPaneVisibility {
  preview: boolean;
  edit: boolean;
}

/** Toggle one pane while preserving the invariant that at least one stays visible. */
export function togglePromptPreviewPane(
  visibility: PromptPreviewPaneVisibility,
  pane: keyof PromptPreviewPaneVisibility,
): PromptPreviewPaneVisibility {
  const otherPane = pane === 'preview' ? 'edit' : 'preview';
  if (visibility[pane] && !visibility[otherPane]) return visibility;
  return { ...visibility, [pane]: !visibility[pane] };
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
  windowed = false,
}) => {
  const { t } = useTranslation('agent');

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [visiblePanes, setVisiblePanes] = useState(() => ({
    preview: initialBaseMode === 'preview',
    edit: initialBaseMode === 'edit',
  }));
  const showPreview = visiblePanes.preview;
  const showEdit = visiblePanes.edit;
  const [savedSnackbarOpen, setSavedSnackbarOpen] = useState(false);
  const initialGenerationKey = useRef<string | undefined>(undefined);
  const wasOpen = useRef(open);

  const {
    loading: agentFrameworkConfigLoading,
    config: agentFrameworkConfig,
    setConfig: setAgentFrameworkConfig,
    schema: handlerSchema,
    persistConfig: persistAgentFrameworkConfig,
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
    if (!open) {
      initialGenerationKey.current = undefined;
      return;
    }
    if (agentFrameworkConfigLoading || !agentFrameworkConfig) return;
    const generationKey = `${agentId}\u0000${agentDefinitionId}\u0000${inputText}`;
    if (initialGenerationKey.current === generationKey) return;
    initialGenerationKey.current = generationKey;
    void controller.generate(
      agentFrameworkConfig,
      agentId,
      inputText.trim().length === 0 ? undefined : inputText,
    );
  }, [agentDefinitionId, agentFrameworkConfig, agentFrameworkConfigLoading, agentId, controller, inputText, open]);

  const handleToggleFullScreen = useCallback((): void => {
    setIsFullScreen(previous => !previous);
  }, []);

  // A tree selection always reveals the editor while preserving the preview.
  const { formFieldsToScrollTo } = state;
  useEffect(() => {
    if (formFieldsToScrollTo.length > 0) {
      setVisiblePanes(previous => previous.edit ? previous : { ...previous, edit: true });
    }
  }, [formFieldsToScrollTo]);

  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (justOpened) {
      setVisiblePanes({
        preview: initialBaseMode === 'preview',
        edit: initialBaseMode === 'edit',
      });
    }
  }, [initialBaseMode, open]);

  const contentFullScreen = isFullScreen || windowed;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={contentFullScreen ? false : 'md'}
      fullWidth
      fullScreen={contentFullScreen}
      slotProps={{
        paper: {
          sx: {
            ...(contentFullScreen && {
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
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={showPreview}
                  disabled={showPreview && !showEdit}
                  onChange={() => {
                    setVisiblePanes(previous => togglePromptPreviewPane(previous, 'preview'));
                  }}
                  slotProps={{ input: { 'aria-label': t('Prompt.ShowPreview') } }}
                />
              }
              label={t('Prompt.ShowPreview')}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={showEdit}
                  disabled={showEdit && !showPreview}
                  onChange={() => {
                    setVisiblePanes(previous => togglePromptPreviewPane(previous, 'edit'));
                  }}
                  slotProps={{ input: { 'aria-label': t('Prompt.ShowEditor') } }}
                />
              }
              label={t('Prompt.ShowEditor')}
            />
            {/* Save to definition button — only in edit mode */}
            {showEdit && (
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
            {!windowed && (
              <IconButton
                aria-label={isFullScreen ? t('Prompt.ExitFullScreen') : t('Prompt.EnterFullScreen')}
                onClick={handleToggleFullScreen}
                sx={{ mr: 1 }}
                title={isFullScreen ? t('Prompt.ExitFullScreen') : t('Prompt.EnterFullScreen')}
              >
                {isFullScreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            )}
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
          ...(contentFullScreen && {
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
              height: contentFullScreen ? '100%' : '70vh',
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
                isFullScreen={contentFullScreen}
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
                isFullScreen={contentFullScreen}
                inputText={inputText}
                agentId={agentId}
                state={state}
                controller={controller}
                agentFrameworkConfigLoading={agentFrameworkConfigLoading}
                agentFrameworkConfig={agentFrameworkConfig}
                setAgentFrameworkConfig={setAgentFrameworkConfig}
                handlerSchema={handlerSchema}
                persistAgentFrameworkConfig={persistAgentFrameworkConfig}
              />
            </Box>
          </Box>
        )}

        {showPreview && !showEdit && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: contentFullScreen ? '100%' : '70vh' }}>
            <PreviewProgressBar show={state.loading} state={state} />
            <PreviewTabsView
              isFullScreen={contentFullScreen}
              state={state}
              controller={controller}
            />
          </Box>
        )}

        {showEdit && !showPreview && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: contentFullScreen ? '100%' : '70vh' }}>
            <EditView
              isFullScreen={contentFullScreen}
              inputText={inputText}
              agentId={agentId}
              state={state}
              controller={controller}
              agentFrameworkConfigLoading={agentFrameworkConfigLoading}
              agentFrameworkConfig={agentFrameworkConfig}
              setAgentFrameworkConfig={setAgentFrameworkConfig}
              handlerSchema={handlerSchema}
              persistAgentFrameworkConfig={persistAgentFrameworkConfig}
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
