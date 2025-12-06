import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { format } from 'date-fns';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';

/**
 * File object structure that can be either a string or an object with path and status.
 */
interface FileObject {
  path?: string;
  status?: string;
}

/**
 * Commit data structure matching react-git-log's Commit type.
 */
interface CommitData {
  hash: string;
  message: string;
  committerDate: string;
  author?: {
    name?: string;
    email?: string;
  };
  files?: (string | FileObject)[];
}

/**
 * Props for CustomGitTooltip component.
 * Based on the react-git-log CustomTooltipProps interface.
 */
interface CustomGitTooltipProps {
  /**
   * Details of the commit that is being hovered over.
   */
  commit: CommitData;
  /**
   * The brighter, border colour of the commit based on the current theme.
   */
  borderColour: string;
  /**
   * The darker, background colour of the commit based on the current theme.
   */
  backgroundColour: string;
  /**
   * Translation function passed from parent component to avoid hook usage in conditionally rendered component.
   */
  t: TFunction;
}

/**
 * Custom tooltip component for git commit nodes.
 * Displays file count, file names, and commit date instead of hash.
 *
 * Note: This component cannot use hooks like useTranslation because it's rendered
 * conditionally (only when hovering), which would violate React's Rules of Hooks.
 * The translation function is passed as a prop instead.
 */
export function CustomGitTooltip({ commit, borderColour, backgroundColour, t }: CustomGitTooltipProps): ReactElement<HTMLElement> {
  const theme = useTheme();
  const files = commit.files ?? [];
  const fileCount = files.length;

  // Show first 3 files
  const displayFiles = files.slice(0, 3);
  const hasMoreFiles = fileCount > 3;

  // Format the commit date
  const commitDate = commit.committerDate ? new Date(commit.committerDate) : null;
  const formattedDate = commitDate ? format(commitDate, 'yyyy-MM-dd HH:mm:ss') : t('GitLog.UnknownDate');

  return (
    <Box
      sx={{
        border: `2px solid ${borderColour}`,
        backgroundColor: backgroundColour,
        color: theme.palette.text.primary,
        padding: '8px 12px',
        borderRadius: '4px',
        minWidth: '200px',
        maxWidth: '300px',
        fontSize: '0.875rem',
      }}
    >
      {/* Commit Message */}
      <Typography
        variant='body2'
        sx={{
          fontWeight: 'bold',
          marginBottom: '8px',
          wordBreak: 'break-word',
        }}
      >
        {commit.message}
      </Typography>

      {/* Commit Date */}
      <Typography
        variant='caption'
        sx={{
          display: 'block',
          marginBottom: '8px',
          opacity: 0.9,
        }}
      >
        {formattedDate}
      </Typography>

      {/* File Count */}
      <Typography
        variant='caption'
        sx={{
          display: 'block',
          marginBottom: fileCount > 0 ? '4px' : 0,
          opacity: 0.85,
        }}
      >
        {fileCount === 0
          ? t('GitLog.NoFilesChanged')
          : t('GitLog.FilesChanged', { count: fileCount })}
      </Typography>

      {/* File Names */}
      {displayFiles.length > 0 && (
        <Box sx={{ marginTop: '4px' }}>
          {displayFiles.map((file, index) => {
            // Handle both string and object file formats
            const filePath = typeof file === 'string' ? file : (file as unknown as FileObject).path || '';
            const fileName = filePath.split('/').pop() || filePath;
            return (
              <Typography
                key={index}
                variant='caption'
                sx={{
                  display: 'block',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  opacity: 0.8,
                  marginBottom: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={filePath}
              >
                {fileName}
              </Typography>
            );
          })}
          {hasMoreFiles && (
            <Typography
              variant='caption'
              sx={{
                display: 'block',
                opacity: 0.7,
                fontStyle: 'italic',
                marginTop: '2px',
              }}
            >
              {t('GitLog.AndMoreFiles', { count: fileCount - 3 })}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
