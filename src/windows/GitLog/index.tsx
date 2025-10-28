import { Helmet } from '@dr.pogodin/react-helmet';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { GitLog as ReactGitLog } from '@tomplum/react-git-log';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CommitDetailsPanel } from './CommitDetailsPanel';
import { CustomCommitNode } from './CustomCommitNode';
import { FileDiffPanel } from './FileDiffPanel';
import { FilesChangedColumn } from './FilesChangedColumn';
import { useCommitContextMenu } from './useCommitContextMenu';
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
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
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

export default function GitHistory(): React.JSX.Element {
  const { t } = useTranslation();
  const { entries, loading, error, currentBranch, workspaceInfo } = useGitLogData();
  const { selectedCommit, setSelectedCommit } = useCommitDetails();
  const { handleContextMenu } = useCommitContextMenu(workspaceInfo);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

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
          {entries.length > 0 && currentBranch !== null
            ? (
              <ReactGitLog
                entries={entries}
                currentBranch={currentBranch}
                theme='dark'
                onSelectCommit={(commit) => {
                  setSelectedCommit(commit);
                  setSelectedFile(null); // Reset selected file when commit changes
                }}
                enableSelectedCommitStyling
              >
                <ReactGitLog.Tags />
                <ReactGitLog.GraphHTMLGrid
                  nodeTheme='default'
                  node={(properties: Parameters<typeof CustomCommitNode>[0]) => (
                    <CustomCommitNode
                      {...properties}
                      onContextMenu={handleContextMenu}
                    />
                  )}
                />
                <ReactGitLog.Table
                  timestampFormat='YYYY-MM-DD HH:mm:ss'
                  row={({ commit, backgroundColour }) => (
                    <FilesChangedColumn
                      commit={commit}
                      backgroundColour={backgroundColour}
                      selected={selectedCommit?.hash === commit.hash}
                      onClick={() => {
                        setSelectedCommit(commit);
                        setSelectedFile(null);
                      }}
                    />
                  )}
                />
              </ReactGitLog>
            )
            : (
              <Box p={2}>
                <Typography>{t('GitLog.NoCommits')}</Typography>
              </Box>
            )}
        </GitLogWrapper>

        <DetailsWrapper>
          <DetailsPanelWrapper>
            <CommitDetailsPanel
              commit={selectedCommit}
              onContextMenu={handleContextMenu}
              onFileSelect={setSelectedFile}
              selectedFile={selectedFile}
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
