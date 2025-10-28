import type { Commit } from '@tomplum/react-git-log';
import { useState } from 'react';

export interface ICommitDetails {
  selectedCommit: Commit | undefined;
  setSelectedCommit: (commit: Commit | undefined) => void;
}

export function useCommitDetails(): ICommitDetails {
  const [selectedCommit, setSelectedCommit] = useState<Commit | undefined>(undefined);

  return {
    selectedCommit,
    setSelectedCommit,
  };
}
