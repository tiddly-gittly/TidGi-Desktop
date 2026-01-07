import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import type React from 'react';
import { useTranslation } from 'react-i18next';

import { CellBox, FileChip, StyledTableRow } from './styles';
import type { GitLogEntry } from './types';

interface ICommitTableRowProps {
  commit: GitLogEntry;
  commitDate: Date;
  onSelect: () => void;
  selected: boolean;
  onSyncClick?: () => void;
}

export function CommitTableRow({ commit, selected, commitDate, onSelect, onSyncClick }: ICommitTableRowProps): React.JSX.Element {
  const { t, i18n } = useTranslation();

  // Use files from commit entry (already loaded in useGitLogData)
  const files = commit.files ?? [];
  const displayFiles = files.slice(0, 3);
  const hasMore = files.length > 3;

  return (
    <StyledTableRow
      selected={selected}
      onClick={onSelect}
      data-testid={commit.hash === '' ? 'uncommitted-changes-row' : `commit-row-${commit.hash}`}
      data-selected={selected}
    >
      <CellBox sx={{ width: '40%', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant='body2'
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {commit.message}
        </Typography>
        {commit.isUnpushed && commit.hash !== '' && (
          <Tooltip title={t('ContextMenu.SyncNow')}>
            <Box
              component='div'
              onClick={(event) => {
                event.stopPropagation();
                onSyncClick?.();
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'primary.main',
                '&:hover': {
                  opacity: 0.7,
                },
                flexShrink: 0,
              }}
              data-testid={`sync-button-${commit.hash}`}
            >
              <CloudUploadIcon sx={{ fontSize: '1rem' }} />
            </Box>
          </Tooltip>
        )}
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
