/**
 * Wiki Tiddler Selector — button + Popper for picking wiki tiddlers to attach to a message.
 *
 * Desktop-specific: loads tiddlers from all active wiki workspaces via window.service IPC.
 */
import type { WikiTiddlerAttachment } from '@memeloop/react-ui/chat';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import { Autocomplete, Box, CircularProgress, IconButton, Popper, TextField, Tooltip, Typography } from '@mui/material';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Internal type for Autocomplete options.
 * Extends WikiTiddlerAttachment with a workspaceId needed for grouping.
 */
type TiddlerOption = WikiTiddlerAttachment & { workspaceId: string };

interface WikiTiddlerSelectorProps {
  disabled?: boolean;
  onSelect: (tiddler: WikiTiddlerAttachment) => void;
}

/**
 * Narrow IWikiServerRouteResponse.data to an array of objects with a title.
 */
function dataIsTiddlerArray(data: unknown): data is Array<{ title?: string }> {
  return Array.isArray(data);
}

export const WikiTiddlerSelector: React.FC<WikiTiddlerSelectorProps> = ({ disabled, onSelect }) => {
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
    setAnchorElement(event.currentTarget);
    setSearchText('');
  };

  const handleClose = () => {
    setAnchorElement(null);
  };

  const handleSelect = (_event: React.SyntheticEvent, value: TiddlerOption | null) => {
    if (value) {
      onSelect({ workspaceName: value.workspaceName, tiddlerTitle: value.tiddlerTitle });
    }
    handleClose();
  };

  const filteredOptions = searchText
    ? options.filter(
      (option) =>
        option.tiddlerTitle.toLowerCase().includes(searchText.toLowerCase()) ||
        option.workspaceName.toLowerCase().includes(searchText.toLowerCase()),
    )
    : options;

  return (
    <>
      <Tooltip title={t('Agent.Attachment.AddTiddler', 'Attach wiki tiddler')}>
        <span>
          <IconButton
            size='small'
            onClick={handleButtonClick}
            disabled={disabled}
            data-testid='wiki-tiddler-selector-button'
          >
            <LibraryBooksIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Popper
        open={open}
        anchorEl={anchorElement}
        placement='bottom-start'
        style={{ zIndex: 1300 }}
      >
        <Box
          data-testid='wiki-tiddler-selector-popper'
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
          <Typography variant='subtitle2' sx={{ px: 0.5 }}>
            {t('Agent.Attachment.SelectTiddler', 'Select a tiddler to attach')}
          </Typography>
          {loading && !loaded
            ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            )
            : (
              <Autocomplete
                size='small'
                autoFocus
                options={filteredOptions}
                groupBy={(option) => option.workspaceName}
                getOptionLabel={(option) => option.tiddlerTitle}
                renderInput={(parameters) => (
                  <TextField
                    {...parameters}
                    placeholder={t('Agent.Attachment.SearchTiddlers', 'Search tiddlers...')}
                    onChange={(event) => {
                      setSearchText(event.target.value);
                    }}
                    value={searchText}
                  />
                )}
                onChange={handleSelect}
                noOptionsText={t('Agent.Attachment.NoTiddlersFound', 'No tiddlers found')}
                isOptionEqualToValue={(option, value) => option.tiddlerTitle === value.tiddlerTitle && option.workspaceId === value.workspaceId}
                slotProps={{
                  popper: { disablePortal: true },
                }}
                renderOption={(properties, option) => {
                  const { key, ...optionProperties } = properties;
                  return (
                    <li key={key} {...optionProperties} data-testid={`wiki-tiddler-option-${option.tiddlerTitle}`}>
                      {option.tiddlerTitle}
                    </li>
                  );
                }}
                open={open}
                onClose={handleClose}
                disablePortal
              />
            )}
        </Box>
      </Popper>
    </>
  );
};
