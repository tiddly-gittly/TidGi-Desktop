import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Commit } from '@tomplum/react-git-log';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const RowWrapper = styled(Box)<{ $backgroundColour?: string; $selected?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px;
  height: 40px;
  background-color: ${({ $backgroundColour, $selected, theme }) => {
  if ($selected) return theme.palette.action.selected;
  return $backgroundColour || 'transparent';
}};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  gap: 8px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${({ theme, $selected }) => $selected ? theme.palette.action.selected : theme.palette.action.hover};
  }
`;

const MessageWrapper = styled(Box)`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
`;

const FilesWrapper = styled(Box)`
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
  overflow: hidden;
`;

const FileChip = styled(Box)`
  font-size: 0.75rem;
  font-family: monospace;
  padding: 2px 6px;
  background-color: ${({ theme }) => theme.palette.action.hover};
  border-radius: 3px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
`;

interface IFilesChangedColumnProps {
  backgroundColour?: string;
  commit: Commit;
  onClick?: () => void;
  selected?: boolean;
}

/**
 * Custom table row component that shows commit message and changed files horizontally
 */
export function FilesChangedColumn({ commit, backgroundColour, onClick, selected }: IFilesChangedColumnProps): React.JSX.Element {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadFiles = async () => {
      setLoading(true);
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
    <RowWrapper
      $backgroundColour={backgroundColour}
      $selected={selected}
      onClick={onClick}
    >
      <MessageWrapper>
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
      </MessageWrapper>

      <FilesWrapper>
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
                <Typography variant='caption' color='text.secondary'>
                  +{files.length - 3} {t('GitLog.Files')}
                </Typography>
              )}
              {files.length === 0 && !loading && (
                <Typography variant='caption' color='text.secondary'>
                  {t('GitLog.NoFilesChanged')}
                </Typography>
              )}
            </>
          )}
      </FilesWrapper>
    </RowWrapper>
  );
}
