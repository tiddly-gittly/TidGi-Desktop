import type { IWorkspace } from '@services/workspaces/interface';
import type { GitLogEntry } from '@tomplum/react-git-log';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const loadGitLog = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get workspaceID from window meta
        const meta = window.meta();
        const workspaceID = (meta as { workspaceID?: string }).workspaceID;

        if (!workspaceID) {
          throw new Error('No workspace ID provided');
        }

        // Get workspace info
        const workspace = await window.service.workspace.get(workspaceID);
        if (!workspace) {
          throw new Error('Workspace not found');
        }

        // Check if it's a wiki workspace
        if (!('wikiFolderLocation' in workspace)) {
          throw new Error('Not a wiki workspace');
        }

        setWorkspaceInfo(workspace);

        // Get git log from service
        const result = await window.service.git.getGitLog(
          workspace.wikiFolderLocation,
          { page: 0, pageSize: 100 },
        );

        setEntries(result.entries);
        setCurrentBranch(result.currentBranch);
      } catch (error_) {
        const error = error_ as Error;
        console.error('Failed to load git log:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    void loadGitLog();
  }, []);

  return { entries, loading, error, currentBranch, workspaceInfo };
}
