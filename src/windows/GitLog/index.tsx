import { Helmet } from '@dr.pogodin/react-helmet';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import { useTheme } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { WindowNames } from '@services/windows/WindowProperties';
import type { WindowMeta } from '@services/windows/WindowProperties';
import { AllBranchesView } from './AllBranchesView';
import { CommitDetailsPanel } from './CommitDetailsPanel';
import { CurrentBranchView } from './CurrentBranchView';
import { CustomGitTooltip } from './CustomGitTooltip';
import { FileDiffPanel } from './FileDiffPanel';
import { ContentWrapper, DetailsPanelWrapper, DetailsWrapper, DiffPanelWrapper, GitLogWrapper, LoadingContainer, Root, TabContent, TabsContainer } from './styles';
import { useCommitDetails } from './useCommitDetails';
import { useCommitSelection, useGitHistoryState, useInfiniteScroll, useSyncHandler } from './useGitHistoryLogic';
import { useGitLogData } from './useGitLogData';

export default function GitHistory(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  // Get workspace ID from window.meta() - type is guaranteed by WindowMeta
  const meta = window.meta() as WindowMeta[WindowNames.gitHistory];
  const workspaceID = meta.workspaceID;

  // If no workspaceID, show loading - this should never happen in normal flow
  if (!workspaceID) {
    return (
      <Root maxWidth={false}>
        <Helmet>
          <title>{t('GitLog.Title')}</title>
        </Helmet>
        <LoadingContainer>
          <CircularProgress />
          <Typography variant='body2' color='textSecondary' sx={{ mt: 2 }}>
            {t('GitLog.LoadingWorkspace')}
          </Typography>
        </LoadingContainer>
      </Root>
    );
  }

  const { entries, loading, loadingMore, error, workspaceInfo, currentBranch, lastChangeType, setLastChangeType, hasMore, loadMore, setSearchParams } = useGitLogData(workspaceID);
  const {
    selectedCommit,
    selectedCommitHashes,
    commitSelectionAnchorHash,
    setSelectedCommit,
    setSelectedCommitHashes,
    setCommitSelectionAnchorHash,
  } = useCommitDetails();
  const {
    selectedFile,
    setSelectedFile,
    selectedFiles,
    setSelectedFiles,
    fileSelectionAnchor,
    setFileSelectionAnchor,
    viewMode,
    setViewMode,
    shouldSelectFirst,
    setShouldSelectFirst,
    currentSearchParameters,
    setCurrentSearchParameters,
    isSyncing,
    setIsSyncing,
    snackbar,
    setSnackbar,
  } = useGitHistoryState();

  // Determine theme mode for react-git-log
  const gitLogTheme = theme.palette.mode as 'light' | 'dark';

  const showSnackbar = useCallback(
    (message: string, severity: 'success' | 'error' | 'info' = 'info') => {
      setSnackbar({ open: true, message, severity });
    },
    [],
  );

  const { handleSyncClick: performSync } = useSyncHandler({
    workspaceInfo,
    isSyncing,
    showSnackbar,
  });

  const handleSyncClick = useCallback(async () => {
    setIsSyncing(true);
    try {
      await performSync();
    } finally {
      setIsSyncing(false);
    }
  }, [performSync, setIsSyncing]);

  const handleCloseSnackbar = useCallback(() => {
    setSnackbar((previous) => ({ ...previous, open: false }));
  }, []);

  // Create a tooltip wrapper that passes the translation function
  // The props coming from react-git-log don't include 't', so we add it

  const renderTooltip = (props: Omit<Parameters<typeof CustomGitTooltip>[0], 't'>) => CustomGitTooltip({ ...props, t });

  const { handleCommitSuccess, handleRevertSuccess, handleUndoSuccess, handleSearch } = useCommitSelection({
    shouldSelectFirst,
    entries,
    setShouldSelectFirst,
    setSelectedCommit,
    setSelectedCommitHashes,
    setCommitSelectionAnchorHash,
    lastChangeType,
    setLastChangeType,
    selectedCommit,
    setSearchParams,
    setCurrentSearchParameters,
    setSelectedFile,
    setSelectedFiles,
    setFileSelectionAnchor,
  });

  const clearFileSelection = useCallback(() => {
    setSelectedFile(null);
    setSelectedFiles([]);
    setFileSelectionAnchor(null);
  }, [setFileSelectionAnchor, setSelectedFile, setSelectedFiles]);

  const handleCommitClick = useCallback((entry: typeof entries[number], event: React.MouseEvent) => {
    const entryIndex = entries.findIndex((currentEntry) => currentEntry.hash === entry.hash);
    if (entryIndex < 0) return;

    if (event.shiftKey) {
      const anchorHash = commitSelectionAnchorHash ?? selectedCommit?.hash ?? entry.hash;
      const anchorIndex = entries.findIndex((currentEntry) => currentEntry.hash === anchorHash);
      const rangeStart = anchorIndex >= 0 ? Math.min(anchorIndex, entryIndex) : entryIndex;
      const rangeEnd = anchorIndex >= 0 ? Math.max(anchorIndex, entryIndex) : entryIndex;
      const nextHashes = entries.slice(rangeStart, rangeEnd + 1).map((currentEntry) => currentEntry.hash);
      setSelectedCommitHashes(nextHashes);
      setSelectedCommit(entry);
      if (commitSelectionAnchorHash === null) {
        setCommitSelectionAnchorHash(anchorHash);
      }
      clearFileSelection();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const isAlreadySelected = selectedCommitHashes.includes(entry.hash);
      const nextHashes = isAlreadySelected
        ? selectedCommitHashes.filter((hash) => hash !== entry.hash)
        : [...selectedCommitHashes, entry.hash];
      setSelectedCommitHashes(nextHashes);

      if (isAlreadySelected) {
        if (nextHashes.length === 0) {
          setSelectedCommit(undefined);
          setCommitSelectionAnchorHash(null);
        } else {
          const fallbackCommit = entries.find((currentEntry) => currentEntry.hash === nextHashes[nextHashes.length - 1]);
          setSelectedCommit(fallbackCommit);
        }
      } else {
        setSelectedCommit(entry);
        setCommitSelectionAnchorHash(entry.hash);
      }

      clearFileSelection();
      return;
    }

    setSelectedCommit(entry);
    setSelectedCommitHashes([entry.hash]);
    setCommitSelectionAnchorHash(entry.hash);
    clearFileSelection();
  }, [
    clearFileSelection,
    commitSelectionAnchorHash,
    entries,
    selectedCommit?.hash,
    selectedCommitHashes,
    setCommitSelectionAnchorHash,
    setSelectedCommit,
    setSelectedCommitHashes,
  ]);

  const handleFileSelect = useCallback((filePath: string | null, event?: React.MouseEvent) => {
    if (!filePath) {
      clearFileSelection();
      return;
    }

    const filePaths = selectedCommit?.files?.map((file) => file.path) ?? [];
    const fileIndex = filePaths.indexOf(filePath);
    if (fileIndex < 0) return;

    if (event?.shiftKey) {
      const anchorPath = fileSelectionAnchor ?? selectedFile ?? filePath;
      const anchorIndex = filePaths.indexOf(anchorPath);
      const rangeStart = anchorIndex >= 0 ? Math.min(anchorIndex, fileIndex) : fileIndex;
      const rangeEnd = anchorIndex >= 0 ? Math.max(anchorIndex, fileIndex) : fileIndex;
      const nextPaths = filePaths.slice(rangeStart, rangeEnd + 1);
      setSelectedFiles(nextPaths);
      setSelectedFile(filePath);
      if (fileSelectionAnchor === null) {
        setFileSelectionAnchor(anchorPath);
      }
      return;
    }

    if (event?.ctrlKey || event?.metaKey) {
      const isAlreadySelected = selectedFiles.includes(filePath);
      const nextPaths = isAlreadySelected
        ? selectedFiles.filter((path) => path !== filePath)
        : [...selectedFiles, filePath];
      setSelectedFiles(nextPaths);

      if (isAlreadySelected) {
        setSelectedFile(nextPaths[nextPaths.length - 1] ?? null);
        if (nextPaths.length === 0) {
          setFileSelectionAnchor(null);
        }
      } else {
        setSelectedFile(filePath);
        setFileSelectionAnchor(filePath);
      }
      return;
    }

    setSelectedFile(filePath);
    setSelectedFiles([filePath]);
    setFileSelectionAnchor(filePath);
  }, [clearFileSelection, fileSelectionAnchor, selectedCommit?.files, selectedFile, selectedFiles, setFileSelectionAnchor, setSelectedFile, setSelectedFiles]);

  const handleFileActionSuccess = useCallback((affectedPaths: string[] = []) => {
    if (affectedPaths.length === 0) {
      clearFileSelection();
      return;
    }

    setSelectedFiles((previous) => previous.filter((path) => !affectedPaths.includes(path)));
    setSelectedFile((previous) => previous && affectedPaths.includes(previous) ? null : previous);
    setFileSelectionAnchor((previous) => previous && affectedPaths.includes(previous) ? null : previous);
  }, [clearFileSelection, setFileSelectionAnchor, setSelectedFile, setSelectedFiles]);

  const selectedCommits = entries.filter((entry) => selectedCommitHashes.includes(entry.hash));

  const { isRowLoaded, loadMoreRows } = useInfiniteScroll({
    hasMore,
    entries,
    loadingMore,
    loadMore,
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
        <GitLogWrapper data-testid='git-log-list'>
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
                <CurrentBranchView
                  entries={entries}
                  loading={loading}
                  loadingMore={loadingMore}
                  hasMore={hasMore}
                  selectedCommitHashes={selectedCommitHashes}
                  currentSearchParameters={currentSearchParameters}
                  onSearch={handleSearch}
                  onSelectCommit={handleCommitClick}
                  onSyncClick={handleSyncClick}
                  isRowLoaded={isRowLoaded}
                  loadMoreRows={loadMoreRows}
                />
              )
              : (
                <AllBranchesView
                  entries={entries}
                  currentBranch={currentBranch}
                  theme={gitLogTheme}
                  onSelectCommit={(entry) => {
                    setSelectedCommit(entry);
                    setSelectedCommitHashes([entry.hash]);
                    setCommitSelectionAnchorHash(entry.hash);
                    setSelectedFile(null);
                  }}
                  renderTooltip={renderTooltip}
                />
              )}
          </TabContent>
        </GitLogWrapper>
        <DetailsWrapper>
          {workspaceInfo
            ? (
              <DetailsPanelWrapper>
                <CommitDetailsPanel
                  commit={selectedCommit ?? null}
                  selectedCommits={selectedCommits}
                  workspaceID={workspaceInfo.id}
                  showSnackbar={showSnackbar}
                  onFileSelect={handleFileSelect}
                  selectedFile={selectedFile}
                  selectedFiles={selectedFiles}
                  onCommitSuccess={handleCommitSuccess}
                  onRevertSuccess={handleRevertSuccess}
                  onUndoSuccess={handleUndoSuccess}
                  isLatestCommit={selectedCommit?.hash === entries.find((entry) => entry.hash !== '')?.hash}
                />
              </DetailsPanelWrapper>
            )
            : (
              <DetailsPanelWrapper
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                }}
              >
                <CircularProgress />
              </DetailsPanelWrapper>
            )}
        </DetailsWrapper>

        <DiffPanelWrapper>
          {workspaceInfo
            ? (
              <FileDiffPanel
                commitHash={selectedCommit?.hash || ''}
                filePath={selectedFile}
                selectedFiles={selectedFiles}
                workspaceID={workspaceInfo.id}
                onDiscardSuccess={handleFileActionSuccess}
                showSnackbar={showSnackbar}
              />
            )
            : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  width: '100%',
                }}
              >
                <CircularProgress />
              </Box>
            )}
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
