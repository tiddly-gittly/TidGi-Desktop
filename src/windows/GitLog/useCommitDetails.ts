import { useState } from 'react';

import type { GitLogEntry } from './types';

export interface ICommitDetails {
  selectedCommit: GitLogEntry | undefined;
  selectedCommitHashes: string[];
  commitSelectionAnchorHash: string | null;
  setSelectedCommit: (commit: GitLogEntry | undefined) => void;
  setSelectedCommitHashes: (hashes: string[]) => void;
  setCommitSelectionAnchorHash: (hash: string | null) => void;
}

export function useCommitDetails(): ICommitDetails {
  const [selectedCommit, setSelectedCommit] = useState<GitLogEntry | undefined>(undefined);
  const [selectedCommitHashes, setSelectedCommitHashes] = useState<string[]>([]);
  const [commitSelectionAnchorHash, setCommitSelectionAnchorHash] = useState<string | null>(null);

  return {
    selectedCommit,
    selectedCommitHashes,
    commitSelectionAnchorHash,
    setSelectedCommit,
    setSelectedCommitHashes,
    setCommitSelectionAnchorHash,
  };
}
