import { Helmet } from '@dr.pogodin/react-helmet';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import type { LogRecord } from '@services/libs/log/schema';
import type { ILogEntrySummary, ILogPageCursor, ILogSource } from '@services/logViewer/interface';
import { WindowMeta, WindowNames } from '@services/windows/WindowProperties';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { List, type RowComponentProps, useListRef } from 'react-window';

const MonacoEditor = lazy(async () => await import('@monaco-editor/react'));

interface IRowData {
  entries: ILogEntrySummary[];
  expandedID?: string;
  details?: LogRecord;
  onToggle: (entry: ILogEntrySummary) => void;
  copyMessageLabel: string;
  copyJSONLabel: string;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf()) ? timestamp : date.toLocaleString();
}

const borderColorByLevel: Record<LogRecord['level'], string> = {
  error: 'error.main',
  warn: 'warning.main',
  info: 'info.main',
  debug: 'grey.600',
};

function LogRow({ index, style, entries, expandedID, details, onToggle, copyMessageLabel, copyJSONLabel }: RowComponentProps<IRowData>): React.JSX.Element {
  const entry = entries[index];
  const expanded = expandedID === entry.id;
  return (
    <Box style={style} sx={{ px: 1, py: 0.5 }}>
      <Paper
        variant='outlined'
        data-testid={`log-entry-${entry.id}`}
        onClick={() => {
          onToggle(entry);
        }}
        sx={{ p: 1, cursor: 'pointer', height: '100%', overflow: 'hidden', borderLeft: 4, borderLeftColor: borderColorByLevel[entry.level] }}
      >
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <Chip size='small' label={entry.level.toUpperCase()} color={entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warning' : 'default'} />
          <Typography variant='caption' color='text.secondary' sx={{ flexShrink: 0 }}>{formatTimestamp(entry.timestamp)}</Typography>
          <Typography
            variant='body2'
            component='span'
            sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          >
            {entry.preview}
            {entry.messageLength > 300 ? '…' : ''}
          </Typography>
        </Stack>
        <Stack direction='row' spacing={0.75} sx={{ mt: 0.5, alignItems: 'center' }}>
          <Typography variant='caption' color='text.secondary'>{entry.component ?? entry.process}</Typography>
          <Typography variant='caption' color='text.secondary'>PID {entry.pid}</Typography>
          {entry.scope.kind === 'workspace' && <Chip size='small' variant='outlined' label={entry.scope.workspaceID.slice(0, 8)} />}
          {Object.entries(entry.meta).map(([key, value]) => <Typography key={key} variant='caption' color='text.secondary'>{key}: {String(value)}</Typography>)}
        </Stack>
        {expanded && (
          <Box
            onClick={event => {
              event.stopPropagation();
            }}
            sx={{ mt: 1 }}
          >
            <Divider sx={{ mb: 1 }} />
            {details?.id === entry.id
              ? (
                <>
                  <Suspense fallback={<CircularProgress size={20} />}>
                    <MonacoEditor
                      height='260px'
                      language='plaintext'
                      value={details.message}
                      options={{
                        readOnly: true,
                        domReadOnly: true,
                        wordWrap: 'on',
                        minimap: { enabled: false },
                        folding: false,
                        lineNumbers: 'off',
                        largeFileOptimizations: true,
                        scrollBeyondLastLine: false,
                      }}
                    />
                  </Suspense>
                  <Stack direction='row' spacing={1} sx={{ my: 1 }}>
                    <Chip
                      clickable
                      size='small'
                      label={copyMessageLabel}
                      onClick={() => {
                        void navigator.clipboard.writeText(details.message);
                      }}
                    />
                    <Chip
                      clickable
                      size='small'
                      label={copyJSONLabel}
                      onClick={() => {
                        void navigator.clipboard.writeText(JSON.stringify(details, null, 2));
                      }}
                    />
                  </Stack>
                  <Box component='table' sx={{ width: '100%', fontSize: 12 }}>
                    <tbody>
                      {Object.entries(details.meta).map(([key, value]) => (
                        <tr key={key}>
                          <Box component='th' sx={{ textAlign: 'left', pr: 2, verticalAlign: 'top' }}>{key}</Box>
                          <Box component='td' sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{JSON.stringify(value)}</Box>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                </>
              )
              : <CircularProgress size={20} />}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default function LogViewer(): React.JSX.Element {
  const { t } = useTranslation();
  const meta = window.meta() as WindowMeta[WindowNames.logViewer] & { windowName: WindowNames };
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [sources, setSources] = useState<ILogSource[]>([]);
  const [selectedSourceID, setSelectedSourceID] = useState('');
  const [entries, setEntries] = useState<ILogEntrySummary[]>([]);
  const [olderCursor, setOlderCursor] = useState<ILogPageCursor>();
  const [expandedID, setExpandedID] = useState<string>();
  const [details, setDetails] = useState<LogRecord>();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(true);
  const [workspaceNames, setWorkspaceNames] = useState<Record<string, string>>({});
  const listReference = useListRef(null);
  const detailRequestID = useRef<string | undefined>(undefined);
  const entriesRequestID = useRef(0);

  useEffect(() => {
    void window.service.logViewer.listDates().then(result => {
      setDates(result);
      setDate(result[0] ?? new Date().toLocaleDateString('sv-SE'));
    });
    void window.service.workspace.getWorkspacesAsList().then(workspaces => {
      setWorkspaceNames(Object.fromEntries(workspaces.map(workspace => [workspace.id, workspace.name])));
    });
  }, []);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await window.service.logViewer.listSources(date);
        if (cancelled) return;
        setSources(result);
        const preferred = result.find(source =>
          source.scope.kind === 'workspace' &&
          source.scope.workspaceID === meta.workspaceID &&
          source.process === meta.initialProcess
        );
        setSelectedSourceID(previous =>
          preferred?.id ??
            (result.some(source => source.id === previous) ? previous : meta.workspaceID === undefined ? result[0]?.id ?? '' : '')
        );
      } catch {
        if (!cancelled) {
          setSources([]);
          setSelectedSourceID('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, meta.initialProcess, meta.workspaceID]);

  const selectedSource = useMemo(() => sources.find(source => source.id === selectedSourceID), [selectedSourceID, sources]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 350);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const loadEntries = useCallback(async () => {
    const requestID = ++entriesRequestID.current;
    if (selectedSource === undefined) {
      setEntries([]);
      setOlderCursor(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = debouncedQuery.trim()
        ? await window.service.logViewer.search(selectedSource, debouncedQuery)
        : await window.service.logViewer.readPage(selectedSource);
      if (requestID !== entriesRequestID.current) return;
      if (Array.isArray(result)) {
        setEntries(result);
        setOlderCursor(undefined);
      } else {
        setEntries(result.entries);
        setOlderCursor(result.nextCursor);
      }
    } catch {
      if (requestID !== entriesRequestID.current) return;
      setEntries([]);
      setOlderCursor(undefined);
    } finally {
      if (requestID === entriesRequestID.current) setLoading(false);
    }
  }, [debouncedQuery, selectedSource]);

  const loadOlder = useCallback(async () => {
    if (selectedSource === undefined || olderCursor === undefined || debouncedQuery.trim()) return;
    const requestID = ++entriesRequestID.current;
    setLoading(true);
    setFollowing(false);
    try {
      const page = await window.service.logViewer.readPage(selectedSource, olderCursor);
      if (requestID !== entriesRequestID.current) return;
      setEntries(current => [...page.entries, ...current]);
      setOlderCursor(page.nextCursor);
    } catch {
      // Keep the entries already loaded and allow a later retry.
    } finally {
      if (requestID === entriesRequestID.current) setLoading(false);
    }
  }, [debouncedQuery, olderCursor, selectedSource]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (following && entries.length > 0) {
      listReference.current?.scrollToRow({ index: entries.length - 1, align: 'end' });
    }
  }, [entries, following, listReference]);

  useEffect(() => {
    if (!following || selectedSource === undefined || date !== dates[0] || debouncedQuery.trim()) return;
    const timer = setInterval(() => {
      void loadEntries();
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [date, dates, debouncedQuery, following, loadEntries, selectedSource]);

  const toggleEntry = useCallback((entry: ILogEntrySummary) => {
    if (expandedID === entry.id) {
      detailRequestID.current = undefined;
      setExpandedID(undefined);
      setDetails(undefined);
      return;
    }
    detailRequestID.current = entry.id;
    setExpandedID(entry.id);
    setFollowing(false);
    setDetails(undefined);
    void window.service.logViewer.readEntry(entry.ref)
      .then(value => {
        if (detailRequestID.current === entry.id) setDetails(value);
      })
      .catch(() => {
        if (detailRequestID.current === entry.id) setDetails(undefined);
      });
  }, [expandedID]);

  const globalSources = sources.filter(source => source.scope.kind === 'global');
  const workspaceSources = new Map<string, ILogSource[]>();
  for (const source of sources) {
    if (source.scope.kind !== 'workspace') continue;
    const list = workspaceSources.get(source.scope.workspaceID) ?? [];
    list.push(source);
    workspaceSources.set(source.scope.workspaceID, list);
  }
  const rowData = useMemo(() => ({
    entries,
    expandedID,
    details,
    onToggle: toggleEntry,
    copyMessageLabel: t('LogViewer.CopyMessage'),
    copyJSONLabel: t('LogViewer.CopyJSON'),
  }), [details, entries, expandedID, t, toggleEntry]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Helmet>
        <title>{t('LogViewer.Title')}</title>
      </Helmet>
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center', p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <FormControl size='small' sx={{ minWidth: 150 }}>
          <InputLabel>{t('LogViewer.Date')}</InputLabel>
          <Select
            label={t('LogViewer.Date')}
            value={date}
            onChange={event => {
              setDate(event.target.value);
            }}
          >
            {dates.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          size='small'
          fullWidth
          value={query}
          onChange={event => {
            setQuery(event.target.value);
          }}
          placeholder={t('LogViewer.Search')}
          slotProps={{
            htmlInput: {
              'data-testid': 'log-search-input',
            },
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          variant='outlined'
          disabled={loading || olderCursor === undefined || debouncedQuery.trim().length > 0}
          onClick={() => {
            void loadOlder();
          }}
          sx={{ flexShrink: 0 }}
        >
          {t('LogViewer.LoadOlder')}
        </Button>
        <Tooltip title={t('LogViewer.Refresh')}>
          <IconButton
            aria-label={t('LogViewer.Refresh')}
            onClick={() => {
              void loadEntries();
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ display: 'flex', minHeight: 0, flex: 1 }}>
        <Paper square variant='outlined' sx={{ width: 300, overflow: 'auto', p: 1 }}>
          <SimpleTreeView
            selectedItems={selectedSourceID}
            onSelectedItemsChange={(_event, itemID) => {
              if (typeof itemID === 'string' && sources.some(source => source.id === itemID)) setSelectedSourceID(itemID);
            }}
            defaultExpandedItems={[
              'global',
              'workspaces',
              ...(meta.workspaceID === undefined ? [] : [`workspace:${meta.workspaceID}`]),
            ]}
          >
            <TreeItem itemId='global' label={t('LogViewer.Global')}>
              {globalSources.map(source => (
                <TreeItem
                  key={source.id}
                  itemId={source.id}
                  label={source.label}
                  data-testid={`log-source-${source.id}`}
                  data-selected={selectedSourceID === source.id}
                />
              ))}
            </TreeItem>
            <TreeItem itemId='workspaces' label={t('LogViewer.Workspaces')}>
              {[...workspaceSources].map(([workspaceID, list]) => (
                <TreeItem
                  key={workspaceID}
                  itemId={`workspace:${workspaceID}`}
                  label={`${workspaceNames[workspaceID] ?? 'Workspace'} (${workspaceID.slice(0, 8)})`}
                >
                  {list.map(source => (
                    <TreeItem
                      key={source.id}
                      itemId={source.id}
                      label={source.label}
                      data-testid={`log-source-${source.id}`}
                      data-selected={selectedSourceID === source.id}
                    />
                  ))}
                </TreeItem>
              ))}
            </TreeItem>
          </SimpleTreeView>
        </Paper>
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {loading && <CircularProgress size={24} sx={{ position: 'absolute', zIndex: 2, top: 12, right: 12 }} />}
          {selectedSource === undefined
            ? <Alert severity='info' sx={{ m: 2 }}>{t('LogViewer.NoSources')}</Alert>
            : entries.length === 0 && !loading
            ? <Alert severity='info' sx={{ m: 2 }}>{t('LogViewer.NoEntries')}</Alert>
            : (
              <List
                listRef={listReference}
                rowComponent={LogRow}
                rowCount={entries.length}
                rowHeight={(index) => entries[index]?.id === expandedID ? 430 : 72}
                rowProps={rowData}
                style={{ height: '100%', width: '100%' }}
                overscanCount={8}
                onScroll={event => {
                  const element = event.currentTarget;
                  setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
                }}
              />
            )}
        </Box>
      </Box>
    </Box>
  );
}
