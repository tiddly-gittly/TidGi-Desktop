import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { GitLogEntry, ISearchParameters } from './types';

interface ISnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
}

interface IUseGitHistoryStateReturn {
  selectedFile: string | null;
  setSelectedFile: Dispatch<SetStateAction<string | null>>;
  viewMode: 'current' | 'all';
  setViewMode: Dispatch<SetStateAction<'current' | 'all'>>;
  shouldSelectFirst: boolean;
  setShouldSelectFirst: Dispatch<SetStateAction<boolean>>;
  currentSearchParameters: ISearchParameters;
  setCurrentSearchParameters: Dispatch<SetStateAction<ISearchParameters>>;
  isSyncing: boolean;
  setIsSyncing: Dispatch<SetStateAction<boolean>>;
  snackbar: ISnackbarState;
  setSnackbar: Dispatch<SetStateAction<ISnackbarState>>;
}

export function useGitHistoryState(): IUseGitHistoryStateReturn {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'current' | 'all'>('current');
  const [shouldSelectFirst, setShouldSelectFirst] = useState(false);
  const [currentSearchParameters, setCurrentSearchParameters] = useState<ISearchParameters>({
    mode: 'none',
    query: '',
    startDate: null,
    endDate: null,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [snackbar, setSnackbar] = useState<ISnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  return {
    selectedFile,
    setSelectedFile,
    viewMode,
    setViewMode,
    shouldSelectFirst,
    setShouldSelectFirst,
    currentSearchParameters,
    setCurrentSearchParameters,
    isSyncing,
    setIsSyncing,
    snackbar,
    setSnackbar,
  };
}

interface IUseSyncHandlerReturn {
  handleSyncClick: () => Promise<void>;
}

interface IUseSyncHandlerProps {
  workspaceInfo: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  isSyncing: boolean;
  showSnackbar: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

export function useSyncHandler({ workspaceInfo, isSyncing, showSnackbar }: IUseSyncHandlerProps): IUseSyncHandlerReturn {
  const { t } = useTranslation();

  const handleSyncClick = useCallback(async () => {
    if (isSyncing || !workspaceInfo || !('wikiFolderLocation' in workspaceInfo)) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await (window.service as any).sync.syncWikiIfNeeded(workspaceInfo); // eslint-disable-line @typescript-eslint/no-explicit-any
      showSnackbar(t('Sync.Success'), 'success');
    } catch (error) {
      console.error('Failed to sync:', error);
      showSnackbar(
        t('Sync.Failure', { error: error instanceof Error ? error.message : 'Unknown error' }),
        'error',
      );
    }
  }, [workspaceInfo, isSyncing, showSnackbar, t]);

  return { handleSyncClick };
}

interface IUseCommitSelectionReturn {
  handleCommitSuccess: () => void;
  handleUndoSuccess: () => void;
  handleSearch: (parameters: ISearchParameters) => void;
}

interface IUseCommitSelectionProps {
  shouldSelectFirst: boolean;
  entries: GitLogEntry[];
  setShouldSelectFirst: (value: boolean) => void;
  setSelectedCommit: (commit: GitLogEntry | undefined) => void;
  lastChangeType: string | null;
  selectedCommit: GitLogEntry | undefined;
  setSearchParams: (parameters: ISearchParameters) => void;
  setCurrentSearchParameters: (parameters: ISearchParameters) => void;
  setSelectedFile: (value: string | null) => void;
}

export function useCommitSelection({
  shouldSelectFirst,
  entries,
  setShouldSelectFirst,
  setSelectedCommit,
  lastChangeType,
  selectedCommit,
  setSearchParams,
  setCurrentSearchParameters,
  setSelectedFile,
}: IUseCommitSelectionProps): IUseCommitSelectionReturn {
  // Auto-select first commit after successful manual commit
  useEffect(() => {
    if (shouldSelectFirst && entries.length > 0) {
      // Find the first non-uncommitted commit
      const firstCommit = entries.find((entry) => entry.hash !== '');
      if (firstCommit) {
        setSelectedCommit(firstCommit);
        setShouldSelectFirst(false);
      }
    }
  }, [shouldSelectFirst, entries, setSelectedCommit, setShouldSelectFirst]);

  // Auto-select first commit when a new commit is detected
  useEffect(() => {
    if (lastChangeType === 'commit' && entries.length > 0) {
      // Find the first non-uncommitted commit (the newly created commit)
      const firstCommit = entries.find((entry) => entry.hash !== '');
      if (firstCommit) {
        setSelectedCommit(firstCommit);
      }
    }
  }, [lastChangeType, entries, setSelectedCommit]);

  // Auto-select uncommitted changes after undo
  useEffect(() => {
    if (lastChangeType === 'undo' && entries.length > 0) {
      // Find uncommitted entry (hash === '')
      const uncommittedEntry = entries.find((entry) => entry.hash === '');
      if (uncommittedEntry) {
        setSelectedCommit(uncommittedEntry);
      } else {
        // If no uncommitted changes, deselect
        setSelectedCommit(undefined);
      }
    }
  }, [lastChangeType, entries, setSelectedCommit]);

  // Maintain selection across refreshes by hash
  // Skip if we should select first (manual commit) or if a commit just happened (auto-selection in progress)
  useEffect(() => {
    if (selectedCommit && entries.length > 0 && !shouldSelectFirst && lastChangeType !== 'commit') {
      // Try to find the same commit in the new entries
      const stillExists = entries.find((entry) => entry.hash === selectedCommit.hash);
      // Only update if data actually changed (compare by serialization)
      if (stillExists && JSON.stringify(stillExists) !== JSON.stringify(selectedCommit)) {
        // Update to the new entry object to get fresh data
        setSelectedCommit(stillExists);
      }
    }
  }, [entries, selectedCommit, shouldSelectFirst, lastChangeType, setSelectedCommit]);

  const handleCommitSuccess = useCallback(() => {
    // Trigger selection of first commit after data refreshes
    setShouldSelectFirst(true);
  }, [setShouldSelectFirst]);

  const handleUndoSuccess = useCallback(() => {
    // After undo, we want to select uncommitted changes
    // Set a special flag that will be handled by the effect above
    // Using lastChangeType 'undo' will trigger the selection logic
    setLastChangeType('undo');
  }, [setLastChangeType]);

  const handleSearch = useCallback(
    (parameters: ISearchParameters) => {
      setSearchParams(parameters);
      setCurrentSearchParameters(parameters);
      // Reset selection when searching
      setSelectedCommit(undefined);
      setSelectedFile(null);
    },
    [setSearchParams, setCurrentSearchParameters, setSelectedCommit, setSelectedFile],
  );

  return { handleCommitSuccess, handleUndoSuccess, handleSearch };
}

interface IUseInfiniteScrollReturn {
  isRowLoaded: (index: number) => boolean;
  loadMoreRows: (startIndex: number, stopIndex: number) => Promise<void>;
}

interface IUseInfiniteScrollProps {
  hasMore: boolean;
  entries: GitLogEntry[];
  loadingMore: boolean;
  loadMore: () => Promise<void>;
}

export function useInfiniteScroll({ hasMore, entries, loadingMore, loadMore }: IUseInfiniteScrollProps): IUseInfiniteScrollReturn {
  // Check if an item is loaded
  const isRowLoaded = useCallback((index: number) => !hasMore || index < entries.length, [hasMore, entries.length]);

  // Load more items callback for InfiniteLoader
  const loadMoreRows = useCallback(
    async (_startIndex: number, _stopIndex: number) => {
      if (loadingMore || !hasMore) return;

      await loadMore();
    },
    [loadingMore, hasMore, loadMore],
  );

  return { isRowLoaded, loadMoreRows };
}
