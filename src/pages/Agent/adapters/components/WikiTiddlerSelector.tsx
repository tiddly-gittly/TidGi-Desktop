/**
 * Wiki Tiddler Selector — button + Popper for picking wiki tiddlers to attach to a message.
 *
 * Desktop-specific: loads tiddlers from all active wiki workspaces via window.service IPC.
 */
import type { WikiTiddlerAttachment } from '@memeloop/react-ui/chat';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import { Autocomplete, type AutocompleteRenderInputParams, Box, ClickAwayListener, IconButton, ListItemIcon, ListItemText, Popper, TextField, Tooltip } from '@mui/material';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Internal type for Autocomplete options.
 * Extends WikiTiddlerAttachment with a workspaceId needed for grouping.
 */
type TiddlerOption = WikiTiddlerAttachment & { kind: 'tiddler'; workspaceId: string };
type ImageOption = { kind: 'image'; id: 'AddImage'; label: string };
type AttachmentOption = TiddlerOption | ImageOption;

interface WikiTiddlerSelectorProps {
  disabled?: boolean;
  onAddImage: () => void;
  onSelect: (tiddler: WikiTiddlerAttachment) => void;
}

/**
 * Narrow IWikiServerRouteResponse.data to an array of objects with a title.
 */
function dataIsTiddlerArray(data: unknown): data is Array<{ title?: string }> {
  return Array.isArray(data);
}

export const WikiTiddlerSelector: React.FC<WikiTiddlerSelectorProps> = ({ disabled, onAddImage, onSelect }) => {
  const { t } = useTranslation('agent');
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [options, setOptions] = useState<TiddlerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [searchText, setSearchText] = useState('');
  const open = Boolean(anchorElement);
  const abortControllerReference = useRef<AbortController | null>(null);

  const loadOptions = useCallback(async () => {
    abortControllerReference.current?.abort();
    const abortController = new AbortController();
    abortControllerReference.current = abortController;

    setLoading(true);
    setLoaded(false);

    try {
      // IWorkspace uses `wikiFolderLocation` as a discriminator for wiki workspaces.
      const allWorkspaces = await window.service.workspace.getWorkspacesAsList();
      const activeWikiWorkspaces = allWorkspaces.filter(
        (workspace): workspace is typeof workspace & { id: string; name: string } => 'wikiFolderLocation' in workspace && !workspace.hibernated,
      );

      const tiddlerOptions: TiddlerOption[] = [];

      for (const workspace of activeWikiWorkspaces) {
        if (abortController.signal.aborted) return;
        try {
          const response = await window.service.wiki.callWikiIpcServerRoute(
            workspace.id,
            'getTiddlersJSON',
            '[!is[system]sort[title]]',
            ['text'],
          );

          if (response?.statusCode === 200 && dataIsTiddlerArray(response.data)) {
            const workspaceTiddlers = response.data.map((tiddler) => ({
              kind: 'tiddler' as const,
              workspaceName: workspace.name,
              tiddlerTitle: tiddler.title ?? '',
              workspaceId: workspace.id,
            }));
            tiddlerOptions.push(...workspaceTiddlers);
          }
        } catch {
          // Skip workspace on error
        }
      }

      if (!abortController.signal.aborted) {
        setOptions(tiddlerOptions);
        setLoaded(true);
      }
    } catch {
      // Ignore
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (open && !loading && !loaded) {
      void loadOptions();
    }
  }, [open, loading, loaded, loadOptions]);

  useEffect(() => {
    return () => {
      abortControllerReference.current?.abort();
    };
  }, []);

  const handleButtonClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElement((current) => current === null ? event.currentTarget : null);
    setSearchText('');
  };

  const handleClose = () => {
    setAnchorElement(null);
  };

  const handleSelect = (_event: React.SyntheticEvent, value: AttachmentOption | null) => {
    if (value?.kind === 'image') {
      onAddImage();
    } else if (value) {
      onSelect({ workspaceName: value.workspaceName, tiddlerTitle: value.tiddlerTitle });
    }
    handleClose();
  };

  const attachmentOptions: AttachmentOption[] = [
    { kind: 'image', id: 'AddImage', label: t('Agent.Attachment.AddImage', 'Add image') },
    ...options,
  ];

  return (
    <>
      <Tooltip title={t('Agent.Attachment.AddAttachment')}>
        <span>
          <IconButton
            size='small'
            onClick={handleButtonClick}
            disabled={disabled}
            data-testid='agent-attach-button'
            aria-expanded={open}
          >
            <AttachFileIcon data-testid='attach-icon' />
          </IconButton>
        </span>
      </Tooltip>
      <Popper
        open={open}
        anchorEl={anchorElement}
        placement='bottom-start'
        style={{ zIndex: 1300 }}
      >
        <ClickAwayListener onClickAway={handleClose}>
          <Box
            sx={{
              width: 360,
              maxHeight: 400,
              bgcolor: 'background.paper',
              borderRadius: 1,
              boxShadow: 4,
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Autocomplete<AttachmentOption>
              size='small'
              autoFocus
              loading={loading && !loaded}
              options={attachmentOptions}
              inputValue={searchText}
              onInputChange={(_event, value) => {
                setSearchText(value);
              }}
              filterOptions={(availableOptions, state) => {
                const query = state.inputValue.trim().toLowerCase();
                if (!query) return availableOptions;
                return availableOptions.filter((option) =>
                  option.kind === 'image'
                    ? option.label.toLowerCase().includes(query)
                    : option.tiddlerTitle.toLowerCase().includes(query) || option.workspaceName.toLowerCase().includes(query)
                );
              }}
              getOptionLabel={(option) => option.kind === 'image' ? option.label : option.tiddlerTitle}
              renderInput={(parameters: AutocompleteRenderInputParams) => {
                const { slotProps: parameterSlotProps, ...otherParameters } = parameters;
                const htmlInput = (parameterSlotProps?.htmlInput ?? {}) as React.InputHTMLAttributes<HTMLInputElement>;
                return (
                  <TextField
                    {...otherParameters}
                    placeholder={t('Agent.Attachment.SearchPlaceholder')}
                    slotProps={{
                      ...parameterSlotProps,
                      htmlInput: {
                        ...htmlInput,
                        'data-testid': 'attachment-autocomplete-input',
                      },
                    }}
                  />
                );
              }}
              onChange={handleSelect}
              noOptionsText={t('Agent.Attachment.NoOptions')}
              isOptionEqualToValue={(option, value) =>
                option.kind === value.kind && (option.kind === 'image'
                  ? option.id === (value as ImageOption).id
                  : option.workspaceId === (value as TiddlerOption).workspaceId && option.tiddlerTitle === (value as TiddlerOption).tiddlerTitle)}
              slotProps={{
                popper: { disablePortal: true },
                listbox: { 'data-testid': 'attachment-listbox' } as React.HTMLAttributes<HTMLUListElement> & { 'data-testid': string },
              }}
              renderOption={(properties, option) => {
                const { key, ...optionProperties } = properties;
                const testId = option.kind === 'image'
                  ? `attachment-option-image-${option.id}`
                  : `attachment-option-tiddler-${option.tiddlerTitle}`;
                return (
                  <Box component='li' key={key} {...optionProperties} data-testid={testId}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {option.kind === 'image' ? <AddPhotoAlternateIcon fontSize='small' /> : <LibraryBooksIcon fontSize='small' />}
                    </ListItemIcon>
                    <ListItemText
                      primary={option.kind === 'image' ? option.label : option.tiddlerTitle}
                      secondary={option.kind === 'tiddler' ? option.workspaceName : undefined}
                    />
                  </Box>
                );
              }}
              open={open}
              onClose={(_event, reason) => {
                // Autocomplete may emit a transient blur while its input is
                // mounting. Let the surrounding ClickAwayListener own outside
                // clicks so opening the attachment picker is deterministic.
                if (reason === 'escape') handleClose();
              }}
              disablePortal
            />
          </Box>
        </ClickAwayListener>
      </Popper>
    </>
  );
};
