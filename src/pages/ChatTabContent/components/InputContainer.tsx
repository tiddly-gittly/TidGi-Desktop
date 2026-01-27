// Input container component for message entry

import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CancelIcon from '@mui/icons-material/StopCircle';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import { Box, IconButton, TextField, Chip, Autocomplete, Popper, Paper, ClickAwayListener } from '@mui/material';
import { styled } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { WikiTiddlerAttachment } from '../hooks/useMessageHandling';

const Wrapper = styled(Box)`
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.palette.background.paper};
  border-top: 1px solid ${props => props.theme.palette.divider};
`;

const Container = styled(Box)`
  display: flex;
  padding: 12px 16px;
  gap: 12px;
  align-items: center;
`;

const InputField = styled(TextField)`
  flex: 1;
  .MuiOutlinedInput-root {
    border-radius: 20px;
    padding-right: 12px;
  }
`;

interface InputContainerProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onCancel: () => void;
  onKeyPress: (event: React.KeyboardEvent) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  selectedFile?: File;
  onFileSelect?: (file: File) => void;
  onClearFile?: () => void;
  selectedWikiTiddlers?: WikiTiddlerAttachment[];
  onWikiTiddlerSelect?: (tiddler: WikiTiddlerAttachment) => void;
  onRemoveWikiTiddler?: (index: number) => void;
}

/**
 * Input container component for message entry
 * Displays a send button that changes to cancel button during streaming
 */
export const InputContainer: React.FC<InputContainerProps> = ({
  value,
  onChange,
  onSend,
  onCancel,
  onKeyPress,
  disabled = false,
  isStreaming = false,
  selectedFile,
  onFileSelect,
  onClearFile,
  selectedWikiTiddlers = [],
  onWikiTiddlerSelect,
  onRemoveWikiTiddler,
}) => {
  const { t } = useTranslation('agent');
  const fileInputReference = React.useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>();
  const [attachmentAnchorEl, setAttachmentAnchorEl] = React.useState<null | HTMLElement>(null);
  const [attachmentOptions, setAttachmentOptions] = React.useState<Array<{ 
    type: 'image' | 'tiddler'; 
    title: string; 
    workspaceName?: string;
    testId?: string;
  }>>([]);
  const [loadingOptions, setLoadingOptions] = React.useState(false);

  React.useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewUrl(undefined);
    }
  }, [selectedFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        void window.service.native.log('error', 'Selected file is not an image', { fileType: file.type });
        void window.service.native.showElectronMessageBox({
          type: 'error',
          title: t('Agent.Error.Title'),
          message: t('Agent.Error.FileValidation.NotAnImage', { fileType: file.type }),
          buttons: ['OK'],
        });
        return;
      }
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        void window.service.native.log('error', 'File size exceeds limit', { fileSize: file.size, maxSize });
        void window.service.native.showElectronMessageBox({
          type: 'error',
          title: t('Agent.Error.Title'),
          message: t('Agent.Error.FileValidation.TooLarge', {
            size: (file.size / 1024 / 1024).toFixed(2),
            maxSize: (maxSize / 1024 / 1024).toFixed(0),
          }),
          buttons: ['OK'],
        });
        return;
      }
      if (onFileSelect) {
        onFileSelect(file);
      }
    }
    // Reset value so same file can be selected again if needed
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleAttachmentClick = (event: React.MouseEvent<HTMLElement>) => {
    // Immediately show Popper with loading state
    setAttachmentAnchorEl(event.currentTarget);
    setLoadingOptions(true);
    
    // Log for debugging
    void window.service.native.log('debug', 'Attachment button clicked, loading options...', {});
    
    // Load options asynchronously
    void (async () => {
      try {
        // Build options: first is "Add Image", then wiki tiddlers from all non-hibernated workspaces
        const options: Array<{ type: 'image' | 'tiddler'; title: string; workspaceName?: string; testId?: string }> = [
          { type: 'image', title: t('Agent.Attachment.AddImage', '📷 Add Image'), workspaceName: '', testId: 'AddImage' },
        ];
        
        // Get all workspaces
        const allWorkspaces = await window.service.workspace.getWorkspacesAsList();
        
        // Filter to wiki workspaces that are not hibernated
        const activeWikiWorkspaces = allWorkspaces.filter(w => 
          'wikiFolderLocation' in w && !w.hibernated
        );
        
        void window.service.native.log('debug', 'Found active wiki workspaces', { 
          count: activeWikiWorkspaces.length,
          workspaces: activeWikiWorkspaces.map(w => w.name),
        });
        
        // Get tiddlers from each active wiki workspace
        for (const workspace of activeWikiWorkspaces) {
          try {
            const response = await window.service.wiki.callWikiIpcServerRoute(
              workspace.id,
              'getTiddlersJSON',
              '[!is[system]sort[title]]',
              ['text'], // Exclude text field for performance
            );
            
            if (response.statusCode === 200 && Array.isArray(response.data)) {
              const tiddlers = response.data.map((t: any) => ({
                type: 'tiddler' as const,
                title: t.title || '',
                workspaceName: workspace.name,
              }));
              options.push(...tiddlers);
              
              void window.service.native.log('debug', `Loaded ${tiddlers.length} tiddlers from workspace`, {
                workspaceName: workspace.name,
              });
            }
          } catch (error) {
            console.error(`Failed to load tiddlers from workspace ${workspace.name}`, error);
          }
        }
        
        void window.service.native.log('debug', 'Attachment options loaded', { totalOptions: options.length });
        setAttachmentOptions(options);
        setLoadingOptions(false);
      } catch (error) {
        console.error('Failed to load attachment options', error);
        void window.service.native.log('error', 'Failed to load attachment options', { error });
        setLoadingOptions(false);
      }
    })();
  };

  const handleCloseAttachmentSelector = () => {
    setAttachmentAnchorEl(null);
  };

  const handleSelectAttachment = (_event: React.SyntheticEvent, value: { type: 'image' | 'tiddler'; title: string; workspaceName?: string; testId?: string } | null) => {
    if (!value) {
      handleCloseAttachmentSelector();
      return;
    }
    
    if (value.type === 'image') {
      // Trigger file input click
      fileInputReference.current?.click();
    } else if (value.type === 'tiddler' && value.workspaceName && onWikiTiddlerSelect) {
      // Add wiki tiddler attachment
      onWikiTiddlerSelect({
        workspaceName: value.workspaceName,
        tiddlerTitle: value.title,
      });
    }
    
    handleCloseAttachmentSelector();
  };

  return (
    <Wrapper>
      {(selectedFile || selectedWikiTiddlers.length > 0) && (
        <Box sx={{ p: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {selectedFile && previewUrl && (
            <Box
              sx={{ position: 'relative', display: 'inline-block' }}
            >
              <Box
                component='img'
                src={previewUrl}
                data-testid='attachment-preview'
                sx={{
                  height: 80,
                  width: 'auto',
                  borderRadius: 1,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
                onClick={() => {
                  // Future: open preview dialog
                  const win = window.open();
                  if (win) {
                    const img = win.document.createElement('img');
                    img.src = previewUrl;
                    img.style.maxWidth = '100%';
                    win.document.body.append(img);
                  }
                }}
              />
              <IconButton
                size='small'
                onClick={onClearFile}
                sx={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  bgcolor: 'background.paper',
                  boxShadow: 1,
                  '&:hover': { bgcolor: 'background.default' },
                }}
              >
                <CloseIcon fontSize='small' />
              </IconButton>
            </Box>
          )}
          {selectedWikiTiddlers.map((tiddler, index) => (
            <Chip
              key={index}
              icon={<LibraryBooksIcon />}
              label={`${tiddler.workspaceName}: ${tiddler.tiddlerTitle}`}
              onDelete={() => onRemoveWikiTiddler?.(index)}
              data-testid={`wiki-tiddler-chip-${index}`}
              sx={{ maxWidth: 300 }}
            />
          ))}
        </Box>
      )}
      <Container>
        <input
          type='file'
          hidden
          ref={fileInputReference}
          accept='image/*'
          onChange={handleFileChange}
        />
        <IconButton
          onClick={handleAttachmentClick}
          disabled={disabled || isStreaming}
          color={(selectedFile || selectedWikiTiddlers.length > 0) ? 'primary' : 'default'}
          data-testid='agent-attach-button'
          title={t('Agent.Attachment.AddAttachment', 'Add attachment')}
        >
          <AttachFileIcon />
        </IconButton>
        <InputField
          value={value}
          onChange={onChange}
          onKeyDown={onKeyPress}
          placeholder={t('Chat.InputPlaceholder')}
          variant='outlined'
          fullWidth
          multiline
          maxRows={4}
          disabled={disabled}
          slotProps={{
            input: {
              inputProps: { 'data-testid': 'agent-message-input' },
              endAdornment: (
                <IconButton
                  data-testid='agent-send-button'
                  onClick={isStreaming ? onCancel : onSend}
                  // During streaming, cancel button should always be enabled
                  // Only disable the button when not streaming and the input is empty AND no file/tiddler selected
                  disabled={isStreaming ? false : (disabled || (!value.trim() && !selectedFile && selectedWikiTiddlers.length === 0))}
                  color={isStreaming ? 'error' : 'primary'}
                  title={isStreaming ? t('Chat.Cancel') : t('Chat.Send')}
                >
                  {isStreaming ? <CancelIcon data-testid='cancel-icon' /> : <SendIcon data-testid='send-icon' />}
                </IconButton>
              ),
            },
          }}
        />
      </Container>

      {/* Attachment Selector Popper */}
      <Popper
        open={Boolean(attachmentAnchorEl)}
        anchorEl={attachmentAnchorEl}
        placement='top-start'
        style={{ zIndex: 1500 }}
      >
        <ClickAwayListener onClickAway={handleCloseAttachmentSelector}>
          <Paper sx={{ p: 2, minWidth: 400, maxWidth: 600 }}>
            <Autocomplete
              open
              loading={loadingOptions}
              options={attachmentOptions}
              groupBy={(option) => option.workspaceName || ''}
              getOptionLabel={(option) => option.title}
              onChange={handleSelectAttachment}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('Agent.Attachment.SelectAttachment', 'Select attachment')}
                  placeholder={t('Agent.Attachment.SearchPlaceholder', 'Search...')}
                  autoFocus
                  data-testid='attachment-autocomplete-input'
                />
              )}
              renderOption={(props, option) => {
                const testId = option.testId || option.title.replace(/[^a-zA-Z0-9]/g, '_');
                return (
                  <li {...props} data-testid={`attachment-option-${option.type}-${testId}`}>
                    {option.title}
                  </li>
                );
              }}
              noOptionsText={t('Agent.Attachment.NoOptions', 'No options available')}
              ListboxProps={{
                'data-testid': 'attachment-listbox',
              }}
            />
          </Paper>
        </ClickAwayListener>
      </Popper>
    </Wrapper>
  );
};
