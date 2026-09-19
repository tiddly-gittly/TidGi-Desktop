import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { GitLog as ReactGitLog } from '@tomplum/react-git-log';
import type React from 'react';
import { useTranslation } from 'react-i18next';

import { CustomGitTooltip } from './CustomGitTooltip';
import type { GitLogEntry } from './types';

interface IAllBranchesViewProps {
  entries: GitLogEntry[];
  currentBranch: string | null;
  theme: 'light' | 'dark';
  onSelectCommit: (entry: GitLogEntry) => void;
  renderTooltip: (props: Omit<Parameters<typeof CustomGitTooltip>[0], 't'>) => React.JSX.Element;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

function isGitLogEntry(value: unknown): value is GitLogEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const author = entry.author;
  const hasAuthorName = author === undefined || (
    author !== null &&
    typeof author === 'object' &&
    typeof Reflect.get(author, 'name') === 'string'
  );
  return typeof entry.hash === 'string' &&
    typeof entry.branch === 'string' &&
    typeof entry.message === 'string' &&
    typeof entry.committerDate === 'string' &&
    isStringArray(entry.parents) &&
    hasAuthorName;
}

export function AllBranchesView({
  entries,
  currentBranch,
  theme,
  onSelectCommit,
  renderTooltip,
}: IAllBranchesViewProps): React.JSX.Element {
  const { t } = useTranslation();

  if (entries.length === 0 || currentBranch === null) {
    return (
      <Box
        sx={{
          p: 2,
        }}
      >
        <Typography>{t('GitLog.NoCommits')}</Typography>
      </Box>
    );
  }

  return (
    <ReactGitLog<GitLogEntry>
      entries={entries}
      currentBranch={currentBranch}
      theme={theme}
      onSelectCommit={(commit) => {
        if (commit !== undefined && isGitLogEntry(commit)) onSelectCommit(commit);
      }}
      enableSelectedCommitStyling
    >
      <ReactGitLog.Tags />
      <ReactGitLog.GraphHTMLGrid nodeTheme='default' showCommitNodeTooltips tooltip={renderTooltip} />
      <ReactGitLog.Table timestampFormat='YYYY-MM-DD HH:mm:ss' />
    </ReactGitLog>
  );
}
