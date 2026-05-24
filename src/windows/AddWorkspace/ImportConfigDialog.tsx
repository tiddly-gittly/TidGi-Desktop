import { Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, List, ListItem, Typography } from '@mui/material';
import type { ISyncableWikiConfig } from '@services/workspaces/syncableConfig';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface IImportConfigDialogProps {
  open: boolean;
  wikiFolderLocation: string | undefined;
  onClose: () => void;
  onConfirm: (selectedConfig: Partial<ISyncableWikiConfig>) => void;
}

function formatConfigValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object') return JSON.stringify(value);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
}

export function ImportConfigDialog({ open, wikiFolderLocation, onClose, onConfirm }: IImportConfigDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [config, configSetter] = useState<Partial<ISyncableWikiConfig> | undefined>(undefined);
  const [loading, loadingSetter] = useState(false);
  const [error, errorSetter] = useState<string | undefined>(undefined);
  const [selectedKeys, selectedKeysSetter] = useState<Set<string>>(new Set());
  const mountedReference = useRef(true);

  useEffect(() => {
    mountedReference.current = true;
    return () => {
      mountedReference.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open || !wikiFolderLocation) return;
    loadingSetter(true);
    errorSetter(undefined);
    selectedKeysSetter(new Set());
    void (async () => {
      try {
        const wikiConfig = await window.service.database.readWikiConfig(wikiFolderLocation);
        if (!mountedReference.current) return;
        configSetter(wikiConfig);
      } catch (error_) {
        if (!mountedReference.current) return;
        errorSetter((error_ as Error).message);
      } finally {
        if (mountedReference.current) {
          loadingSetter(false);
        }
      }
    })();
  }, [open, wikiFolderLocation]);

  const handleToggle = (key: string) => {
    selectedKeysSetter((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (!config) return;
    const selectedConfig: Partial<ISyncableWikiConfig> = {};
    for (const key of selectedKeys) {
      if (key in config) {
        (selectedConfig as Record<string, unknown>)[key] = config[key as keyof ISyncableWikiConfig];
      }
    }
    onConfirm(selectedConfig);
  };

  const configEntries = config ? Object.entries(config).filter(([key]) => key !== 'id' && key !== '$schema' && key !== 'version') : [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('AddWorkspace.SelectConfigToImport')}</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <CircularProgress />
          </div>
        )}
        {error && <Typography color='error'>{error}</Typography>}
        {!loading && !error && configEntries.length === 0 && <Typography>{t('AddWorkspace.NoTidgiConfigFound')}</Typography>}
        {!loading && !error && configEntries.length > 0 && (
          <List dense>
            {configEntries.map(([key, value]) => (
              <ListItem key={key} disablePadding>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedKeys.has(key)}
                      onChange={() => {
                        handleToggle(key);
                      }}
                    />
                  }
                  label={
                    <Typography variant='body2' component='span'>
                      <strong>{key}</strong>: {formatConfigValue(value)}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button
          onClick={handleConfirm}
          variant='contained'
          disabled={loading || selectedKeys.size === 0}
        >
          {t('Confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
