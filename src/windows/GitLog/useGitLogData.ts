import type { IWorkspace } from '@services/workspaces/interface';
import useObservable from 'beautiful-react-hooks/useObservable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filter } from 'rxjs/operators';

import type { getGitLog } from '@services/git/gitOperations';
import type { ISearchParameters } from './SearchBar';
import type { GitLogEntry } from './types';

export interface IGitLogData {
  entries: GitLogEntry[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  currentBranch: string | null;
  workspaceInfo: IWorkspace | null;
  lastChangeType: string | null;
  setLastChangeType: (value: string | null) => void;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  setSearchParams: (parameters: ISearchParameters) => void;
  isSearchMode: boolean;
  /** Manually trigger a data refresh - useful when observable subscription fails */
  triggerRefresh: () => void;
}

export function useGitLogData(workspaceID: string): IGitLogData {
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState<IWorkspace | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastChangeType, setLastChangeType] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchParameters, setSearchParameters] = useState<ISearchParameters>({ mode: 'none', query: '', startDate: null, endDate: null });
  const lastRefreshTime = useRef<number>(0);
  const lastChangeTimestamp = useRef<number>(0);
  const loadingMoreReference = useRef(false);
  const isFirstLoad = useRef(true);

  const isSearchMode = searchParameters.mode !== 'none';
  const hasMore = entries.length < totalCount;

  // Get workspace info once
  useEffect(() => {
    const loadWorkspaceInfo = async () => {
      try {
        if (!workspaceID) {
          throw new Error('No workspace ID provided');
        }

        const workspace = await window.service.workspace.get(workspaceID);
        if (!workspace) {
          throw new Error('Workspace not found');
        }

        if (!('wikiFolderLocation' in workspace)) {
          throw new Error('Not a wiki workspace');
        }

        setWorkspaceInfo(workspace);
      } catch (error_) {
        const error = error_ as Error;
        console.error('Failed to load workspace info:', error);
        setError(error.message);
      }
    };

    void loadWorkspaceInfo();
  }, [workspaceID]);

  // Subscribe to git state changes (only in normal mode, not in search mode)
  const gitStateChange$ = useMemo(
    () =>
      window.observables?.git?.gitStateChange$?.pipe(
        filter((change) => {
          // Skip updates when in search mode to prevent interference
          if (isSearchMode) return false;
          // Only trigger refresh if the change is for our workspace
          if (!change || !workspaceInfo || !('wikiFolderLocation' in workspaceInfo)) return false;
          return change.wikiFolderLocation === workspaceInfo.wikiFolderLocation;
        }),
      ) ?? null,
    [workspaceInfo, isSearchMode],
  );

  useObservable(gitStateChange$, (change) => {
    if (!gitStateChange$) return;

    // Debounce git state changes to prevent excessive refreshes
    // Git operations (like discard) may trigger multiple file system events
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.current;

    // Check if this is the same change event (within 100ms window)
    // This prevents duplicate events from triggering multiple refreshes
    if (change?.timestamp === lastChangeTimestamp.current) {
      return;
    }

    // User-initiated operations should always trigger refresh immediately
    const userOperations = ['commit', 'sync', 'revert', 'undo', 'checkout', 'discard'];
    const isUserOperation = change?.type && userOperations.includes(change.type);

    // For file-change events, use longer debounce (1000ms) to avoid watch-fs storm
    // For other git operations (commit, discard, etc), use shorter debounce (300ms)
    // User operations bypass debounce entirely
    const debounceTime = change?.type === 'file-change' ? 1000 : 300;

    // Allow refresh if enough time has passed since last refresh OR if it's a user operation
    if (isUserOperation || timeSinceLastRefresh >= debounceTime) {
      lastRefreshTime.current = now;
      lastChangeTimestamp.current = change?.timestamp ?? 0;
      // Store the type of change so we can auto-select first commit after a manual commit
      setLastChangeType(change?.type ?? null);
      // Trigger refresh when git state changes
      setRefreshTrigger((previous) => previous + 1);
    }
  });

  // Manually trigger a refresh - useful when observable subscription doesn't work (e.g., cross-process IPC issues)
  const triggerRefresh = useCallback(() => {
    lastRefreshTime.current = Date.now();
    setRefreshTrigger((previous) => previous + 1);
  }, []);

  // Load git log data
  useEffect(() => {
    if (!workspaceInfo || !('wikiFolderLocation' in workspaceInfo)) return;

    const loadGitLog = async () => {
      try {
        // Only show global loading on first load
        if (isFirstLoad.current) {
          setLoading(true);
          isFirstLoad.current = false;
        }
        setError(null);

        // Build options based on search params
        const options: Parameters<typeof getGitLog>[1] = {
          page: 0,
          pageSize: 100,
        };

        if (searchParameters.mode === 'message') {
          options.searchMode = 'message';
          options.searchQuery = searchParameters.query;
        } else if (searchParameters.mode === 'file') {
          options.searchMode = 'file';
          options.filePath = searchParameters.query;
        } else if (searchParameters.mode === 'dateRange') {
          options.searchMode = 'dateRange';
          if (searchParameters.startDate) {
            options.since = searchParameters.startDate.toISOString();
          }
          if (searchParameters.endDate) {
            options.until = searchParameters.endDate.toISOString();
          }
        } else {
          options.searchMode = 'none';
        }

        // Get git log from service
        const result = await window.service.git.callGitOp(
          'getGitLog',
          workspaceInfo.wikiFolderLocation,
          options,
        );

        // Get unpushed commit hashes in parallel with loading files
        const unpushedHashesPromise = window.service.git.callGitOp(
          'getUnpushedCommitHashes',
          workspaceInfo.wikiFolderLocation,
        );

        // Load files for each commit
        const entriesWithFiles = await Promise.all(
          result.entries.map(async (entry) => {
            try {
              // getCommitFiles handles both committed (with hash) and uncommitted (empty hash) changes
              const files = await window.service.git.callGitOp(
                'getCommitFiles',
                workspaceInfo.wikiFolderLocation,
                entry.hash,
              );
              return { ...entry, files };
            } catch (error) {
              console.error(`Failed to load files for commit ${entry.hash || 'uncommitted'}:`, error);
              return { ...entry, files: [] };
            }
          }),
        );

        // Get unpushed hashes and mark entries
        const unpushedHashes = await unpushedHashesPromise;
        const entriesWithUnpushedFlag = entriesWithFiles.map((entry) => ({
          ...entry,
          isUnpushed: unpushedHashes.has(entry.hash),
        }));

        // Use requestAnimationFrame to batch the state updates and reduce flicker
        requestAnimationFrame(() => {
          setEntries(entriesWithUnpushedFlag);
          setCurrentBranch(result.currentBranch);
          setTotalCount(result.totalCount);
          setCurrentPage(0);
        });

        // Log for E2E test timing - only log once per load, not in requestAnimationFrame
        void window.service.native.log('debug', '[test-id-git-log-refreshed]', {
          commitCount: entriesWithFiles.length,
          wikiFolderLocation: workspaceInfo.wikiFolderLocation,
        });
      } catch (error_) {
        const error = error_ as Error;
        console.error('Failed to load git log:', error);
        setError(error.message);
      } finally {
        // Only clear loading if it was set (first load)
        if (loading) {
          setLoading(false);
        }
      }
    };

    void loadGitLog();
  }, [workspaceInfo, refreshTrigger, searchParameters]);

  // Track the last logged entries to detect actual changes
  const lastLoggedEntriesReference = useRef<string>('');

  // Log when entries are actually updated and rendered to DOM
  useEffect(() => {
    if (entries.length > 0 && workspaceInfo && 'wikiFolderLocation' in workspaceInfo) {
      // Create a fingerprint of current entries to detect real changes
      const entriesFingerprint = entries.map(entry => entry.hash || 'uncommitted').join(',');

      // Only log if entries actually changed
      if (entriesFingerprint !== lastLoggedEntriesReference.current) {
        lastLoggedEntriesReference.current = entriesFingerprint;
        // Use setTimeout to ensure DOM has been updated after state changes
        setTimeout(() => {
          void window.service.native.log('debug', '[test-id-git-log-data-rendered]', {
            commitCount: entries.length,
            wikiFolderLocation: workspaceInfo.wikiFolderLocation,
            entriesFingerprint,
          });
        }, 100);
      }
    }
  }, [entries, workspaceInfo]);

  // Load more function for infinite scroll
  const loadMore = useCallback(async () => {
    if (!workspaceInfo || !('wikiFolderLocation' in workspaceInfo)) return;
    if (loadingMoreReference.current || !hasMore) return;

    loadingMoreReference.current = true;
    setLoadingMore(true);

    try {
      const nextPage = currentPage + 1;

      // Build options based on search params
      const options: Parameters<typeof getGitLog>[1] = {
        page: nextPage,
        pageSize: 100,
      };

      if (searchParameters.mode === 'message') {
        options.searchMode = 'message';
        options.searchQuery = searchParameters.query;
      } else if (searchParameters.mode === 'file') {
        options.searchMode = 'file';
        options.filePath = searchParameters.query;
      } else if (searchParameters.mode === 'dateRange') {
        options.searchMode = 'dateRange';
        if (searchParameters.startDate) {
          options.since = searchParameters.startDate.toISOString();
        }
        if (searchParameters.endDate) {
          options.until = searchParameters.endDate.toISOString();
        }
      } else {
        options.searchMode = 'none';
      }

      const result = await window.service.git.callGitOp(
        'getGitLog',
        workspaceInfo.wikiFolderLocation,
        options,
      );

      // Get unpushed commit hashes in parallel with loading files
      const unpushedHashesPromise = window.service.git.callGitOp(
        'getUnpushedCommitHashes',
        workspaceInfo.wikiFolderLocation,
      );

      // Load files for each commit
      const entriesWithFiles = await Promise.all(
        result.entries.map(async (entry) => {
          try {
            const files = await window.service.git.callGitOp(
              'getCommitFiles',
              workspaceInfo.wikiFolderLocation,
              entry.hash,
            );
            return { ...entry, files };
          } catch (error) {
            console.error(`Failed to load files for commit ${entry.hash || 'uncommitted'}:`, error);
            return { ...entry, files: [] };
          }
        }),
      );

      // Get unpushed hashes and mark entries
      const unpushedHashes = await unpushedHashesPromise;
      const entriesWithUnpushedFlag = entriesWithFiles.map((entry) => ({
        ...entry,
        isUnpushed: unpushedHashes.has(entry.hash),
      }));

      setEntries((previous) => [...previous, ...entriesWithUnpushedFlag]);
      setCurrentPage(nextPage);
    } catch (error_) {
      const error = error_ as Error;
      console.error('Failed to load more commits:', error);
    } finally {
      setLoadingMore(false);
      loadingMoreReference.current = false;
    }
  }, [workspaceInfo, currentPage, hasMore, searchParameters]);

  return {
    entries,
    loading,
    loadingMore,
    error,
    currentBranch,
    workspaceInfo,
    lastChangeType,
    setLastChangeType,
    hasMore,
    loadMore,
    setSearchParams: setSearchParameters,
    isSearchMode,
    triggerRefresh,
  };
}
