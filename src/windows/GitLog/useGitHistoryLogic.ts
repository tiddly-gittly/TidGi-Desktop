import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
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
  handleRevertSuccess: () => void;
  handleUndoSuccess: () => void;
  handleSearch: (parameters: ISearchParameters) => void;
}

interface IUseCommitSelectionProps {
  shouldSelectFirst: boolean;
  entries: GitLogEntry[];
  setShouldSelectFirst: (value: boolean) => void;
  setSelectedCommit: (commit: GitLogEntry | undefined) => void;
  lastChangeType: string | null;
  setLastChangeType: (value: string | null) => void;
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
  setLastChangeType,
  selectedCommit,
  setSearchParams,
  setCurrentSearchParameters,
  setSelectedFile,
}: IUseCommitSelectionProps): IUseCommitSelectionReturn {
  // Track if we've already processed the current change type
  const lastProcessedChangeReference = useRef<string | null>(null);
  // Track if we've done initial selection
  const hasInitialSelectionReference = useRef<boolean>(false);

  // Auto-select on initial load: uncommitted changes if present, otherwise first commit
  useEffect(() => {
    if (!hasInitialSelectionReference.current && entries.length > 0 && !selectedCommit) {
      // First try to find uncommitted changes
      const uncommittedEntry = entries.find((entry) => entry.hash === '');
      if (uncommittedEntry) {
        setSelectedCommit(uncommittedEntry);
        hasInitialSelectionReference.current = true;
      } else {
        // If no uncommitted changes, select the first commit
        const firstCommit = entries[0];
        if (firstCommit) {
          setSelectedCommit(firstCommit);
          hasInitialSelectionReference.current = true;
        }
      }
    }
  }, [entries, selectedCommit, setSelectedCommit]);

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

  // Maintain selection across refreshes by hash
  useEffect(() => {
    if (selectedCommit && entries.length > 0 && !shouldSelectFirst) {
      // Try to find the same commit in the new entries
      const stillExists = entries.find((entry) => entry.hash === selectedCommit.hash);

      if (stillExists) {
        // Only update if data actually changed (compare by serialization)
        if (JSON.stringify(stillExists) !== JSON.stringify(selectedCommit)) {
          // Update to the new entry object to get fresh data
          void window.service.native.log('debug', '[test-id-selection-maintained]', { hash: stillExists.hash, message: stillExists.message });
          setSelectedCommit(stillExists);
        }
      } else if (selectedCommit.hash === '') {
        // If selected uncommitted changes no longer exist (e.g., after commit)
        // Select the first non-uncommitted commit
        const firstCommit = entries.find((entry) => entry.hash !== '');
        if (firstCommit) {
          void window.service.native.log('debug', '[test-id-selection-switched-from-uncommitted]', {
            oldHash: selectedCommit.hash,
            newHash: firstCommit.hash,
            newMessage: firstCommit.message,
          });
          setSelectedCommit(firstCommit);
        }
      }
    }
  }, [entries, selectedCommit, shouldSelectFirst, setSelectedCommit]);

  // Handle post-operation selection based on lastChangeType
  useEffect(() => {
    // Skip if we've already processed this change type
    if (lastChangeType && lastChangeType !== lastProcessedChangeReference.current) {
      if (lastChangeType === 'revert' && entries.length > 0) {
        // After revert, wait for the new revert commit to appear in entries
        // The new revert commit should be the first one and different from the currently selected one
        const firstCommit = entries.find((entry) => entry.hash !== '');
        // Only auto-select if the first commit is different from what's currently selected
        // This ensures we're selecting the NEW revert commit, not staying on the old one
        if (firstCommit && (!selectedCommit || firstCommit.hash !== selectedCommit.hash)) {
          void window.service.native.log('debug', '[test-id-revert-auto-select]', { hash: firstCommit.hash, message: firstCommit.message });
          setSelectedCommit(firstCommit);
          lastProcessedChangeReference.current = lastChangeType;
        }
      } else if (lastChangeType === 'undo' && entries.length > 0) {
        // After undo, select uncommitted changes if they exist
        const uncommittedEntry = entries.find((entry) => entry.hash === '');
        if (uncommittedEntry) {
          void window.service.native.log('debug', '[test-id-undo-auto-select]', { message: 'Selected uncommitted changes' });
          setSelectedCommit(uncommittedEntry);
          lastProcessedChangeReference.current = lastChangeType;
        }
      }
    }
  }, [lastChangeType, entries, setSelectedCommit, selectedCommit]);

  const handleCommitSuccess = useCallback(() => {
    // Don't set shouldSelectFirst - let the maintain selection logic handle it
    // The uncommitted changes will disappear and it will auto-select the new commit
    void window.service.native.log('debug', '[test-id-commit-success-handler]', {});
  }, []);

  const handleRevertSuccess = useCallback(() => {
    // After revert, select the new revert commit (first non-uncommitted)
    void window.service.native.log('debug', '[test-id-revert-success-handler]', {});
    setLastChangeType('revert');
  }, [setLastChangeType]);

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

  return { handleCommitSuccess, handleRevertSuccess, handleUndoSuccess, handleSearch };
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
