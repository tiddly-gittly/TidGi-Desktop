import { Helmet } from '@dr.pogodin/react-helmet';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Snackbar from '@mui/material/Snackbar';
import { styled, useTheme } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { GitLog as ReactGitLog } from '@tomplum/react-git-log';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { List as VirtualList } from 'react-window';
import { useInfiniteLoader } from 'react-window-infinite-loader';

import { CommitDetailsPanel } from './CommitDetailsPanel';
import { CustomGitTooltip } from './CustomGitTooltip';
import { FileDiffPanel } from './FileDiffPanel';
import { getFileStatusStyles, type GitFileStatus } from './fileStatusStyles';
import { type ISearchParameters, SearchBar } from './SearchBar';
import type { GitLogEntry } from './types';
import { useCommitDetails } from './useCommitDetails';
import { useGitLogData } from './useGitLogData';

const Root = styled((properties: React.ComponentProps<typeof Container>) => <Container {...properties} />)`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
`;

const ContentWrapper = styled(Box)`
  display: flex;
  flex: 1;
  gap: 8px;
  overflow: hidden;
`;

const GitLogWrapper = styled(Box)`
  width: 600px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
  color: ${({ theme }) => theme.palette.text.primary};
`;

const TabsContainer = styled(Box)`
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

const TabContent = styled(Box)`
  flex: 1;
  overflow: hidden;
`;

const StyledTableRow = styled(Box)<{ selected?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  
  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }

  ${({ selected, theme }) =>
  selected && `
    background-color: ${theme.palette.action.selected};
    
    &:hover {
      background-color: ${theme.palette.action.selected};
    }
  `}
`;

const CellBox = styled(Box)`
  padding: 0 8px;
  overflow: hidden;
`;

const DetailsWrapper = styled(Box)`
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
`;

const DetailsPanelWrapper = styled(Box)`
  flex: 1;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
`;

const DiffPanelWrapper = styled(Box)`
  flex: 1;
  min-width: 400px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
`;

const LoadingContainer = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const FileChip = styled(Box)<{ $status?: GitFileStatus }>`
  display: inline-block;
  font-size: 0.7rem;
  font-family: monospace;
  padding: 2px 4px;
  margin: 2px;
  border-radius: 3px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  ${({ $status, theme }) => getFileStatusStyles($status, theme)}
`;

interface ICommitTableRowProps {
  commit: GitLogEntry;
  commitDate: Date;
  onSelect: () => void;
  selected: boolean;
}

function CommitTableRow({ commit, selected, commitDate, onSelect }: ICommitTableRowProps): React.JSX.Element {
  const { t, i18n } = useTranslation();

  // Use files from commit entry (already loaded in useGitLogData)
  const files = commit.files ?? [];
  const displayFiles = files.slice(0, 3);
  const hasMore = files.length > 3;

  return (
    <StyledTableRow
      selected={selected}
      onClick={onSelect}
    >
      <CellBox sx={{ width: '40%' }}>
        <Typography
          variant='body2'
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {commit.message}
        </Typography>
      </CellBox>
      <CellBox sx={{ width: '40%' }}>
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            overflowX: 'auto',
            overflowY: 'hidden',
            maxHeight: '44px',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            scrollbarWidth: 'none',
          }}
        >
          {displayFiles.map((file, index) => {
            const fileName = file.path.split('/').pop() || file.path;
            return (
              <Tooltip key={index} title={`${file.path} (${file.status})`} placement='top'>
                <FileChip $status={file.status}>{fileName}</FileChip>
              </Tooltip>
            );
          })}
          {hasMore && (
            <Box component='span' sx={{ alignSelf: 'center', ml: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
              +{files.length - 3}
            </Box>
          )}
          {files.length === 0 && (
            <Box component='span' sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {t('GitLog.NoFilesChanged')}
            </Box>
          )}
        </Box>
      </CellBox>
      <CellBox sx={{ width: '20%' }}>
        <Tooltip title={commitDate.toLocaleString()}>
          <Typography variant='body2' color='text.secondary' sx={{ cursor: 'default' }}>
            {formatDistanceToNow(commitDate, { addSuffix: true, locale: i18n.language.startsWith('zh') ? zhCN : enUS })}
          </Typography>
        </Tooltip>
      </CellBox>
    </StyledTableRow>
  );
}

export default function GitHistory(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const { entries, loading, loadingMore, error, workspaceInfo, currentBranch, lastChangeType, hasMore, loadMore, setSearchParams } = useGitLogData();
  const { selectedCommit, setSelectedCommit } = useCommitDetails();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'current' | 'all'>('current');
  const [shouldSelectFirst, setShouldSelectFirst] = useState(false);
  const [currentSearchParameters, setCurrentSearchParameters] = useState<ISearchParameters>({ mode: 'none', query: '', startDate: null, endDate: null });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // Determine theme mode for react-git-log
  const gitLogTheme = theme.palette.mode as 'light' | 'dark';

  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info' = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar(previous => ({ ...previous, open: false }));
  };

  // Create a tooltip wrapper that passes the translation function
  // The props coming from react-git-log don't include 't', so we add it
  const renderTooltip = (props: Omit<Parameters<typeof CustomGitTooltip>[0], 't'>) => {
    return CustomGitTooltip({ ...props, t });
  };

  // Auto-select first commit after successful manual commit
  useEffect(() => {
    if (shouldSelectFirst && entries.length > 0) {
      // Find the first non-uncommitted commit
      const firstCommit = entries.find((entry) => entry.hash !== '');
      if (firstCommit) {
        setSelectedCommit(firstCommit);
        setShouldSelectFirst(false);
      }
    }
  }, [shouldSelectFirst, entries, setSelectedCommit]);

  // Auto-select first commit when a new commit is detected
  useEffect(() => {
    if (lastChangeType === 'commit' && entries.length > 0) {
      // Find the first non-uncommitted commit (the newly created commit)
      const firstCommit = entries.find((entry) => entry.hash !== '');
      if (firstCommit) {
        setSelectedCommit(firstCommit);
      }
    }
  }, [lastChangeType, entries, setSelectedCommit]);

  // Maintain selection across refreshes by hash
  // Skip if we should select first (manual commit) or if a commit just happened (auto-selection in progress)
  useEffect(() => {
    if (selectedCommit && entries.length > 0 && !shouldSelectFirst && lastChangeType !== 'commit') {
      // Try to find the same commit in the new entries
      const stillExists = entries.find((entry) => entry.hash === selectedCommit.hash);
      // Only update if data actually changed (compare by serialization)
      if (stillExists && JSON.stringify(stillExists) !== JSON.stringify(selectedCommit)) {
        // Update to the new entry object to get fresh data
        setSelectedCommit(stillExists);
      }
    }
  }, [entries, selectedCommit, shouldSelectFirst, lastChangeType]);

  const handleCommitSuccess = () => {
    // Trigger selection of first commit after data refreshes
    setShouldSelectFirst(true);
  };

  const handleSearch = useCallback((parameters: ISearchParameters) => {
    setSearchParams(parameters);
    setCurrentSearchParameters(parameters);
    // Reset selection when searching
    setSelectedCommit(undefined);
    setSelectedFile(null);
  }, [setSearchParams, setSelectedCommit]);

  // Check if an item is loaded
  const isRowLoaded = (index: number) => !hasMore || index < entries.length;

  // Load more items callback for InfiniteLoader
  const loadMoreRows = useCallback(
    async (_startIndex: number, _stopIndex: number) => {
      if (loadingMore || !hasMore) return;

      await loadMore();
    },
    [loadingMore, hasMore, loadMore],
  );

  // Use the infinite loader hook

  const onRowsRendered = useInfiniteLoader({
    isRowLoaded,
    loadMoreRows,
    rowCount: hasMore ? entries.length + 1 : entries.length,
  });

  if (loading) {
    return (
      <Root>
        <Helmet>
          <title>{t('GitLog.Title')}</title>
        </Helmet>
        <LoadingContainer>
          <CircularProgress />
        </LoadingContainer>
      </Root>
    );
  }

  if (error !== null) {
    return (
      <Root>
        <Helmet>
          <title>{t('GitLog.Title')}</title>
        </Helmet>
        <Box>
          <Typography color='error'>{error}</Typography>
        </Box>
      </Root>
    );
  }

  const workspaceName = workspaceInfo && 'name' in workspaceInfo ? workspaceInfo.name : '';

  return (
    <Root maxWidth={false}>
      <Helmet>
        <title>{workspaceName ? `${t('GitLog.Title')} - ${workspaceName}` : t('GitLog.Title')}</title>
      </Helmet>

      <ContentWrapper>
        <GitLogWrapper>
          <TabsContainer>
            <Tabs
              value={viewMode}
              onChange={(_event, newValue: 'current' | 'all') => {
                setViewMode(newValue);
              }}
            >
              <Tab label={currentBranch || 'master'} value='current' />
              <Tab label={t('GitLog.AllBranches')} value='all' />
            </Tabs>
          </TabsContainer>

          <TabContent>
            {viewMode === 'current'
              ? (
                <>
                  <SearchBar onSearch={handleSearch} disabled={loading} currentSearchParams={currentSearchParameters} />
                  {entries.length > 0
                    ? (
                      <VirtualList
                        defaultHeight={window.innerHeight - 250}
                        rowCount={entries.length}
                        rowHeight={60}
                        rowProps={{}}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
                        onRowsRendered={onRowsRendered as any}
                        rowComponent={({ index, style }) => {
                          const entry = entries[index];
                          // Should always exist, but TypeScript doesn't know that
                          if (!entry) return <div style={style} />;

                          const commitDate = new Date(entry.committerDate);
                          const isSelected = selectedCommit?.hash === entry.hash;

                          return (
                            <div style={style}>
                              <CommitTableRow
                                commit={entry}
                                selected={isSelected}
                                commitDate={commitDate}
                                onSelect={() => {
                                  setSelectedCommit(entry);
                                  setSelectedFile(null);
                                }}
                              />
                            </div>
                          );
                        }}
                      />
                    )
                    : (
                      <Box p={2}>
                        <Typography>{t('GitLog.NoCommits')}</Typography>
                      </Box>
                    )}
                  {loadingMore && (
                    <Box p={2} display='flex' justifyContent='center'>
                      <CircularProgress size={24} />
                      <Typography ml={1}>{t('GitLog.LoadingMore')}</Typography>
                    </Box>
                  )}
                </>
              )
              : (
                <>
                  {entries.length > 0 && currentBranch !== null
                    ? (
                      <ReactGitLog
                        entries={entries}
                        currentBranch={currentBranch}
                        theme={gitLogTheme}
                        onSelectCommit={(commit) => {
                          setSelectedCommit(commit as unknown as GitLogEntry);
                          setSelectedFile(null);
                        }}
                        enableSelectedCommitStyling
                      >
                        <ReactGitLog.Tags />
                        <ReactGitLog.GraphHTMLGrid
                          nodeTheme='default'
                          showCommitNodeTooltips
                          tooltip={renderTooltip}
                        />
                        <ReactGitLog.Table timestampFormat='YYYY-MM-DD HH:mm:ss' />
                      </ReactGitLog>
                    )
                    : (
                      <Box p={2}>
                        <Typography>{t('GitLog.NoCommits')}</Typography>
                      </Box>
                    )}
                </>
              )}
          </TabContent>
        </GitLogWrapper>
        <DetailsWrapper>
          <DetailsPanelWrapper>
            <CommitDetailsPanel
              commit={selectedCommit ?? null}
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
              onCommitSuccess={handleCommitSuccess}
              onRevertSuccess={handleCommitSuccess}
              isLatestCommit={selectedCommit?.hash === entries.find(entry => entry.hash !== '')?.hash}
            />
          </DetailsPanelWrapper>
        </DetailsWrapper>

        <DiffPanelWrapper>
          <FileDiffPanel
            commitHash={selectedCommit?.hash || ''}
            filePath={selectedFile}
            onDiscardSuccess={() => {
              setSelectedFile(null);
              // Trigger git log refresh after discard
              setShouldSelectFirst(true);
            }}
            showSnackbar={showSnackbar}
          />
        </DiffPanelWrapper>
      </ContentWrapper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Root>
  );
}
