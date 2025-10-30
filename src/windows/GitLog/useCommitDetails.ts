import { useState } from 'react';

import type { GitLogEntry } from './types';

export interface ICommitDetails {
  selectedCommit: GitLogEntry | undefined;
  setSelectedCommit: (commit: GitLogEntry | undefined) => void;
}

export function useCommitDetails(): ICommitDetails {
  const [selectedCommit, setSelectedCommit] = useState<GitLogEntry | undefined>(undefined);

  return {
    selectedCommit,
    setSelectedCommit,
  };
}
