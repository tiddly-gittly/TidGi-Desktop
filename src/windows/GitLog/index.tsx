import { Helmet } from '@dr.pogodin/react-helmet';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import { styled } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { GitLog as ReactGitLog } from '@tomplum/react-git-log';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CommitDetailsPanel } from './CommitDetailsPanel';
import { FileDiffPanel } from './FileDiffPanel';
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
`;

const TabsContainer = styled(Box)`
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
`;

const TabContent = styled(Box)`
  flex: 1;
  overflow: auto;
`;

const StyledTableRow = styled(TableRow)<{ selected?: boolean }>`
  cursor: pointer;
  
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

const FileChip = styled(Box)`
  display: inline-block;
  font-size: 0.7rem;
  font-family: monospace;
  padding: 2px 4px;
  margin: 2px;
  background-color: ${({ theme }) => theme.palette.action.hover};
  border-radius: 3px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

interface ICommitTableRowProps {
  commit: GitLogEntry;
  commitDate: Date;
  onSelect: () => void;
  selected: boolean;
}

function CommitTableRow({ commit, selected, commitDate, onSelect }: ICommitTableRowProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const meta = window.meta();
        const workspaceID = (meta as { workspaceID?: string }).workspaceID;

        if (!workspaceID) return;

        const workspace = await window.service.workspace.get(workspaceID);
        if (!workspace || !('wikiFolderLocation' in workspace)) return;

        const changedFiles = await window.service.git.getCommitFiles(workspace.wikiFolderLocation, commit.hash);
        setFiles(changedFiles);
      } catch (error) {
        console.error('Failed to load commit files:', error);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };

    void loadFiles();
  }, [commit.hash]);

  const displayFiles = files.slice(0, 3);
  const hasMore = files.length > 3;

  return (
    <StyledTableRow
      key={commit.hash}
      selected={selected}
      onClick={onSelect}
    >
      <TableCell>
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
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {loading
            ? (
              <Typography variant='caption' color='text.secondary'>
                ...
              </Typography>
            )
            : (
              <>
                {displayFiles.map((file, index) => {
                  const fileName = file.split('/').pop() || file;
                  return (
                    <Tooltip key={index} title={file} placement='top'>
                      <FileChip>{fileName}</FileChip>
                    </Tooltip>
                  );
                })}
                {hasMore && (
                  <Typography variant='caption' color='text.secondary' sx={{ alignSelf: 'center', ml: 0.5 }}>
                    +{files.length - 3}
                  </Typography>
                )}
                {files.length === 0 && (
                  <Typography variant='caption' color='text.secondary'>
                    {t('GitLog.NoFilesChanged')}
                  </Typography>
                )}
              </>
            )}
        </Box>
      </TableCell>
      <TableCell>
        <Tooltip title={commitDate.toLocaleString()}>
          <Typography variant='body2' color='text.secondary' sx={{ cursor: 'default' }}>
            {formatDistanceToNow(commitDate, { addSuffix: true, locale: i18n.language.startsWith('zh') ? zhCN : enUS })}
          </Typography>
        </Tooltip>
      </TableCell>
    </StyledTableRow>
  );
}

export default function GitHistory(): React.JSX.Element {
  const { t } = useTranslation();
  const { entries, loading, error, workspaceInfo, currentBranch } = useGitLogData();
  const { selectedCommit, setSelectedCommit } = useCommitDetails();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'current' | 'all'>('current');
  const [shouldSelectFirst, setShouldSelectFirst] = useState(false);

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

  // Maintain selection across refreshes by hash
  useEffect(() => {
    if (selectedCommit && entries.length > 0) {
      // Try to find the same commit in the new entries
      const stillExists = entries.find((entry) => entry.hash === selectedCommit.hash);
      if (stillExists) {
        // Update to the new entry object to get fresh data
        setSelectedCommit(stillExists);
      }
    }
  }, [entries, selectedCommit, setSelectedCommit]);

  const handleCommitSuccess = () => {
    // Trigger selection of first commit after data refreshes
    setShouldSelectFirst(true);
  };

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
                  {entries.length > 0
                    ? (
                      <Table stickyHeader size='small'>
                        <TableHead>
                          <TableRow>
                            <TableCell width='40%'>{t('GitLog.Message')}</TableCell>
                            <TableCell width='40%'>{t('GitLog.Files')}</TableCell>
                            <TableCell width='20%'>{t('GitLog.Date')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {entries.map((entry) => {
                            const commitDate = new Date(entry.committerDate);
                            const isSelected = selectedCommit?.hash === entry.hash;

                            return (
                              <CommitTableRow
                                key={entry.hash}
                                commit={entry}
                                selected={isSelected}
                                commitDate={commitDate}
                                onSelect={() => {
                                  setSelectedCommit(entry);
                                  setSelectedFile(null);
                                }}
                              />
                            );
                          })}
                        </TableBody>
                      </Table>
                    )
                    : (
                      <Box p={2}>
                        <Typography>{t('GitLog.NoCommits')}</Typography>
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
                        theme='dark'
                        onSelectCommit={(commit) => {
                          setSelectedCommit(commit as unknown as GitLogEntry);
                          setSelectedFile(null);
                        }}
                        enableSelectedCommitStyling
                      >
                        <ReactGitLog.Tags />
                        <ReactGitLog.GraphHTMLGrid nodeTheme='default' />
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
        </GitLogWrapper>{' '}
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
          />
        </DiffPanelWrapper>
      </ContentWrapper>
    </Root>
  );
}
