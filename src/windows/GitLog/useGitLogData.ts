import type { IWorkspace } from '@services/workspaces/interface';
import useObservable from 'beautiful-react-hooks/useObservable';
import { useEffect, useMemo, useState } from 'react';
import { filter } from 'rxjs/operators';

import type { GitLogEntry } from './types';

export interface IGitLogData {
  entries: GitLogEntry[];
  loading: boolean;
  error: string | null;
  currentBranch: string | null;
  workspaceInfo: IWorkspace | null;
}

export function useGitLogData(): IGitLogData {
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState<IWorkspace | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Get workspace info once
  useEffect(() => {
    const loadWorkspaceInfo = async () => {
      try {
        const meta = window.meta();
        const workspaceID = (meta as { workspaceID?: string }).workspaceID;

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
  }, []);

  // Subscribe to git state changes
  const gitStateChange$ = useMemo(
    () =>
      window.observables.git.gitStateChange$.pipe(
        filter((change) => {
          // Only trigger refresh if the change is for our workspace
          if (!change || !workspaceInfo || !('wikiFolderLocation' in workspaceInfo)) return false;
          return change.wikiFolderLocation === workspaceInfo.wikiFolderLocation;
        }),
      ),
    [workspaceInfo],
  );

  useObservable(gitStateChange$, () => {
    // Trigger refresh when git state changes
    setRefreshTrigger((previous) => previous + 1);
  });

  // Load git log data
  useEffect(() => {
    if (!workspaceInfo || !('wikiFolderLocation' in workspaceInfo)) return;

    const loadGitLog = async () => {
      try {
        // Only show loading on initial load
        const isInitialLoad = entries.length === 0;
        if (isInitialLoad) {
          setLoading(true);
        }
        setError(null);

        // Get git log from service
        const result = await window.service.git.getGitLog(
          workspaceInfo.wikiFolderLocation,
          { page: 0, pageSize: 100 },
        );

        // Load files for each commit
        const entriesWithFiles = await Promise.all(
          result.entries.map(async (entry) => {
            // Skip uncommitted changes (hash is empty)
            if (!entry.hash) {
              return { ...entry, files: [] };
            }

            try {
              const files = await window.service.git.getCommitFiles(
                workspaceInfo.wikiFolderLocation,
                entry.hash,
              );
              return { ...entry, files };
            } catch (error) {
              console.error(`Failed to load files for commit ${entry.hash}:`, error);
              return { ...entry, files: [] };
            }
          }),
        );

        // Use requestAnimationFrame to batch the state updates and reduce flicker
        requestAnimationFrame(() => {
          setEntries(entriesWithFiles);
          setCurrentBranch(result.currentBranch);
        });
      } catch (error_) {
        const error = error_ as Error;
        console.error('Failed to load git log:', error);
        setError(error.message);
      } finally {
        // Only clear loading on initial load
        const isInitialLoad = entries.length === 0;
        if (isInitialLoad) {
          setLoading(false);
        }
      }
    };

    void loadGitLog();
  }, [workspaceInfo, refreshTrigger, entries.length]);

  return { entries, loading, error, currentBranch, workspaceInfo };
}
