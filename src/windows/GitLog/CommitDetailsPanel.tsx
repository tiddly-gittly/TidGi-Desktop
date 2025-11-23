import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { styled } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getFileStatusStyles, type GitFileStatus } from './fileStatusStyles';
import type { GitLogEntry } from './types';

const Panel = styled(Box)`
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const TabsWrapper = styled(Box)`
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  padding: 0 16px;
`;

const TabContent = styled(Box)`
  flex: 1;
  overflow: auto;
  padding: 16px;
`;

const EmptyState = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

const FileListWrapper = styled(Box)`
  flex: 1;
  overflow: auto;
  min-height: 0;
`;

const ActionsWrapper = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FileStatusBadge = styled(Box)<{ $status?: GitFileStatus }>`
  display: inline-block;
  font-size: 0.6rem;
  padding: 1px 4px;
  margin-right: 4px;
  border-radius: 2px;
  font-weight: 600;
  text-transform: uppercase;
  ${({ $status, theme }) => getFileStatusStyles($status, theme)}
`;

interface ICommitDetailsPanelProps {
  commit: GitLogEntry | null;
  isLatestCommit?: boolean;
  onCommitSuccess?: () => void;
  onFileSelect?: (file: string | null) => void;
  onRevertSuccess?: () => void;
  selectedFile?: string | null;
}

export function CommitDetailsPanel(
  { commit, isLatestCommit: _isLatestCommit, onCommitSuccess, onFileSelect, onRevertSuccess, selectedFile }: ICommitDetailsPanelProps,
): React.JSX.Element {
  const { t } = useTranslation();
  const [currentTab, setCurrentTab] = useState<'details' | 'actions'>('details');
  const [isReverting, setIsReverting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Use files from commit entry (already loaded in useGitLogData)
  const fileChanges = commit?.files ?? [];

  const handleRevert = async () => {
    if (!commit || isReverting) return;

    setIsReverting(true);
    try {
      const meta = window.meta();
      const workspaceID = (meta as { workspaceID?: string }).workspaceID;

      if (!workspaceID) return;

      const workspace = await window.service.workspace.get(workspaceID);
      if (!workspace || !('wikiFolderLocation' in workspace)) return;

      // Pass the commit message to revertCommit for better revert message
      await window.service.git.revertCommit(workspace.wikiFolderLocation, commit.hash, commit.message);
      console.log('Revert success');
      // Notify parent to select the new revert commit
      if (onRevertSuccess) {
        onRevertSuccess();
      }
    } catch (error) {
      console.error('Failed to revert commit:', error);
    } finally {
      setIsReverting(false);
    }
  };

  const handleCommitNow = async () => {
    if (isCommitting) return;

    setIsCommitting(true);
    try {
      const meta = window.meta();
      const workspaceID = (meta as { workspaceID?: string }).workspaceID;

      if (!workspaceID) return;

      const workspace = await window.service.workspace.get(workspaceID);
      if (!workspace || !('wikiFolderLocation' in workspace)) return;

      await window.service.git.commitAndSync(workspace, {
        dir: workspace.wikiFolderLocation,
        commitOnly: true,
      });
      console.log('Commit success');
      // Notify parent to select the new commit
      if (onCommitSuccess) {
        onCommitSuccess();
      }
    } catch (error) {
      console.error('Failed to commit:', error);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCopyHash = () => {
    if (!commit) return;
    navigator.clipboard.writeText(commit.hash).then(() => {
      console.log('Hash copied');
    }).catch((error: unknown) => {
      console.error('Failed to copy hash:', error);
    });
  };

  const handleOpenInGitHub = async () => {
    if (!commit) return;
    try {
      const meta = window.meta();
      const workspaceID = (meta as { workspaceID?: string }).workspaceID;

      if (!workspaceID) return;

      const workspace = await window.service.workspace.get(workspaceID);
      if (!workspace || !('wikiFolderLocation' in workspace) || !('gitUrl' in workspace)) return;

      if (workspace.gitUrl) {
        const githubUrl = workspace.gitUrl
          .replace(/\.git$/, '')
          .replace(/^git@github\.com:/, 'https://github.com/');
        const commitUrl = `${githubUrl}/commit/${commit.hash}`;
        window.open(commitUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to open in GitHub:', error);
    }
  };

  if (!commit) {
    return (
      <Panel>
        <EmptyState>
          <Typography variant='body2'>{t('GitLog.SelectCommit')}</Typography>
        </EmptyState>
      </Panel>
    );
  }

  const renderDetailsTab = () => (
    <TabContent>
      <Box mb={1}>
        <Typography variant='caption' color='textSecondary'>
          {t('GitLog.Hash')}
        </Typography>
        <Typography
          variant='body2'
          fontFamily='monospace'
          fontSize='0.75rem'
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {commit.hash}
        </Typography>
      </Box>

      <Box mb={1}>
        <Typography variant='caption' color='textSecondary'>
          {t('GitLog.Message')}
        </Typography>
        <Typography variant='body2' sx={{ wordBreak: 'break-word' }}>
          {commit.message}
        </Typography>
      </Box>

      {commit.author && (
        <Box mb={1}>
          <Typography variant='caption' color='textSecondary'>
            {t('GitLog.Author')}
          </Typography>
          <Typography
            variant='body2'
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {commit.author.name}
            {commit.author.email && ` <${commit.author.email}>`}
          </Typography>
        </Box>
      )}

      <Box mb={1}>
        <Typography variant='caption' color='textSecondary'>
          {t('GitLog.Date')}
        </Typography>
        <Typography variant='body2' fontSize='0.875rem'>
          {commit.committerDate}
        </Typography>
      </Box>

      <Divider sx={{ my: 1 }} />

      <Typography variant='subtitle2' gutterBottom>
        {t('GitLog.FilesChanged', { count: fileChanges.length })}
      </Typography>

      {fileChanges.length > 0
        ? (
          <FileListWrapper>
            <List dense disablePadding>
              {fileChanges.map((file, index) => (
                <ListItem key={index} disablePadding>
                  <ListItemButton
                    selected={file.path === selectedFile}
                    onClick={() => {
                      onFileSelect?.(file.path === selectedFile ? null : file.path);
                    }}
                  >
                    <ListItemText
                      primary={
                        <>
                          <FileStatusBadge $status={file.status}>{file.status.charAt(0)}</FileStatusBadge>
                          {file.path}
                        </>
                      }
                      slotProps={{
                        primary: {
                          variant: 'body2',
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          sx: {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                        },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </FileListWrapper>
        )
        : (
          <Typography variant='body2' color='textSecondary'>
            {t('GitLog.NoFilesChanged')}
          </Typography>
        )}
    </TabContent>
  );

  const renderActionsTab = () => {
    // Check if this is an uncommitted state (hash would be empty or special)
    const isUncommitted = !commit || commit.hash === '' || commit.message.includes('未提交') || commit.message.includes('Uncommitted');

    return (
      <TabContent>
        <ActionsWrapper>
          {isUncommitted && (
            <>
              <Button
                variant='contained'
                color='success'
                onClick={handleCommitNow}
                fullWidth
                disabled={isCommitting}
                data-testid='commit-now-button'
                startIcon={isCommitting ? <CircularProgress size={16} color='inherit' /> : undefined}
              >
                {isCommitting ? t('GitLog.Committing') : t('ContextMenu.BackupNow')}
              </Button>
              <Divider sx={{ my: 1 }} />
            </>
          )}

          {!isUncommitted && (
            <>
              <Button
                variant='contained'
                color='warning'
                onClick={handleRevert}
                fullWidth
                disabled={isReverting}
                startIcon={isReverting ? <CircularProgress size={16} color='inherit' /> : undefined}
              >
                {isReverting ? t('GitLog.Reverting') : t('GitLog.RevertCommit')}
              </Button>

              <Button variant='outlined' onClick={handleCopyHash} fullWidth>
                {t('GitLog.CopyHash')}
              </Button>

              <Button variant='outlined' onClick={handleOpenInGitHub} fullWidth>
                {t('GitLog.OpenInGitHub')}
              </Button>

              <Divider sx={{ my: 1 }} />

              <Typography variant='caption' color='textSecondary'>
                {t('GitLog.WarningMessage')}
              </Typography>
            </>
          )}
        </ActionsWrapper>
      </TabContent>
    );
  };

  return (
    <Panel>
      <TabsWrapper>
        <Tabs
          value={currentTab}
          onChange={(_event: React.SyntheticEvent, newValue: 'details' | 'actions') => {
            setCurrentTab(newValue);
          }}
        >
          <Tab label={t('GitLog.Details')} value='details' />
          <Tab label={t('GitLog.Actions')} value='actions' />
        </Tabs>
      </TabsWrapper>

      {currentTab === 'details' ? renderDetailsTab() : renderActionsTab()}
    </Panel>
  );
}
