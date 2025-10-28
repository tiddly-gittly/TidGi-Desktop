import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { Commit } from '@tomplum/react-git-log';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Panel = styled(Box)`
  padding: 16px;
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
`;

const EmptyState = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

const FileListWrapper = styled(Box)`
  flex: 1;
  overflow: auto;
  min-height: 0;
`;

interface ICommitDetailsPanelProps {
  commit: Commit | undefined;
  onContextMenu: (commit: Commit, event: React.MouseEvent) => void;
  onFileSelect: (file: string | null) => void;
  selectedFile: string | null;
}

export function CommitDetailsPanel({ commit, onContextMenu, onFileSelect, selectedFile }: ICommitDetailsPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [fileChanges, setFileChanges] = useState<string[]>([]);

  useEffect(() => {
    if (!commit) {
      setFileChanges([]);
      return;
    }

    const loadFileChanges = async () => {
      try {
        const meta = window.meta();
        const workspaceID = (meta as { workspaceID?: string }).workspaceID;

        if (!workspaceID) return;

        const workspace = await window.service.workspace.get(workspaceID);
        if (!workspace || !('wikiFolderLocation' in workspace)) return;

        const files = await window.service.git.getCommitFiles(workspace.wikiFolderLocation, commit.hash);
        setFileChanges(files);
      } catch (error) {
        console.error('Failed to load commit files:', error);
        setFileChanges([]);
      }
    };

    void loadFileChanges();
  }, [commit]);

  if (!commit) {
    return (
      <Panel>
        <EmptyState>
          <Typography variant='body2'>{t('GitLog.SelectCommit')}</Typography>
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      onContextMenu={(event) => {
        onContextMenu(commit, event);
      }}
    >
      <Typography variant='h6' gutterBottom>
        {t('GitLog.CommitDetails')}
      </Typography>

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
        {t('GitLog.FilesChanged')} ({fileChanges.length})
      </Typography>

      {fileChanges.length > 0
        ? (
          <FileListWrapper>
            <List dense disablePadding>
              {fileChanges.map((file, index) => (
                <ListItem key={index} disablePadding>
                  <ListItemButton
                    selected={file === selectedFile}
                    onClick={() => {
                      onFileSelect(file === selectedFile ? null : file);
                    }}
                  >
                    <ListItemText
                      primary={file}
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
    </Panel>
  );
}
