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
      <Box p={2}>
        <Typography>{t('GitLog.NoCommits')}</Typography>
      </Box>
    );
  }

  return (
    <ReactGitLog
      entries={entries}
      currentBranch={currentBranch}
      theme={theme}
      onSelectCommit={(commit) => {
        onSelectCommit(commit as unknown as GitLogEntry);
      }}
      enableSelectedCommitStyling
    >
      <ReactGitLog.Tags />
      <ReactGitLog.GraphHTMLGrid nodeTheme='default' showCommitNodeTooltips tooltip={renderTooltip} />
      <ReactGitLog.Table timestampFormat='YYYY-MM-DD HH:mm:ss' />
    </ReactGitLog>
  );
}
