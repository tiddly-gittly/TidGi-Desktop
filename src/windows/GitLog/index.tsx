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
  const { entries, loading, loadingMore, error, workspaceInfo, currentBranch, lastChangeType, hasMore, loadMore, setSearchParams } = useGitLogData();
  const { selectedCommit, setSelectedCommit } = useCommitDetails();
  const {
    selectedFile,
    setSelectedFile,
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

  const { handleCommitSuccess, handleUndoSuccess, handleSearch } = useCommitSelection({
    shouldSelectFirst,
    entries,
    setShouldSelectFirst,
    setSelectedCommit,
    lastChangeType,
    selectedCommit,
    setSearchParams,
    setCurrentSearchParameters,
    setSelectedFile,
  });

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
                  selectedCommit={selectedCommit}
                  currentSearchParameters={currentSearchParameters}
                  onSearch={handleSearch}
                  onSelectCommit={(entry) => {
                    setSelectedCommit(entry);
                    setSelectedFile(null);
                  }}
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
                    setSelectedFile(null);
                  }}
                  renderTooltip={renderTooltip}
                />
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
              onUndoSuccess={handleUndoSuccess}
              isLatestCommit={selectedCommit?.hash === entries.find((entry) => entry.hash !== '')?.hash}
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
