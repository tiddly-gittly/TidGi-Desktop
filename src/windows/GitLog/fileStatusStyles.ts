import type { Theme } from '@mui/material/styles';
import type { GitFileStatus } from '../../services/git/interface';

// Re-export for convenience
export type { GitFileStatus };

/**
 * Get styled CSS for file status badge/chip based on the status and theme
 */
export function getFileStatusStyles(status: GitFileStatus | undefined, theme: Theme): string {
  const isDark = theme.palette.mode === 'dark';

  switch (status) {
    case 'added':
    case 'untracked':
      return isDark
        ? `
          background-color: rgba(46, 160, 67, 0.3);
          color: #7ee787;
        `
        : `
          background-color: rgba(46, 160, 67, 0.2);
          color: #116329;
        `;
    case 'deleted':
      return isDark
        ? `
          background-color: rgba(248, 81, 73, 0.3);
          color: #ffa198;
        `
        : `
          background-color: rgba(248, 81, 73, 0.2);
          color: #82071e;
        `;
    case 'modified':
      return isDark
        ? `
          background-color: rgba(187, 128, 9, 0.3);
          color: #f0b83f;
        `
        : `
          background-color: rgba(187, 128, 9, 0.2);
          color: #7d4e00;
        `;
    case 'renamed':
      return isDark
        ? `
          background-color: rgba(56, 139, 253, 0.3);
          color: #79c0ff;
        `
        : `
          background-color: rgba(56, 139, 253, 0.2);
          color: #0969da;
        `;
    default:
      return `
          background-color: ${theme.palette.action.hover};
          color: ${theme.palette.text.secondary};
        `;
  }
}
