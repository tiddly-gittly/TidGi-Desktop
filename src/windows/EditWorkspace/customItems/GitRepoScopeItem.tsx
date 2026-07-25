import { FormControlLabel, ListItemText, Radio, RadioGroup, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isWikiWorkspace } from '@services/workspaces/interface';
import { isHtmlWikiWorkspace } from '@services/workspaces/workspacePaths';
import { ListItemVertical } from '../../Preferences/PreferenceComponents';
import { useWorkspaceForm } from '../WorkspaceFormContext';

/**
 * Workspace settings item that lets the user choose which Git repository layer TidGi tracks for
 * this wiki. Detects ancestor Git repos and offers the wiki folder itself plus every ancestor as
 * candidates. Stores the choice as portable relative paths (`gitRepoPath`/`gitManagedRelativePath`)
 * in the workspace config so it follows the wiki across devices.
 *
 * All path math (resolving the stored relative config back to an absolute repo, and computing the
 * portable relative paths to store) is delegated to the main process via IPC — the renderer only
 * renders the candidate list and the current selection it receives from the backend.
 */
export function GitRepoScopeItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const [ancestorRepos, setAncestorRepos] = useState<string[]>([]);
  // Absolute repo root the stored config currently resolves to (forward-slash normalized by the
  // main process). Undefined until the backend resolves it.
  const [currentRepoPath, setCurrentRepoPath] = useState<string | undefined>(undefined);

  const wikiFolderLocation = isWikiWorkspace(workspace) ? workspace.wikiFolderLocation : undefined;
  // Normalize once so candidates, the radio values, and the backend-resolved currentRepoPath are
  // all in the same forward-slash form and directly comparable.
  const wikiFolder = wikiFolderLocation?.replace(/\\/g, '/');

  // Detect ancestor Git repos. `requestIdleCallback` is always available in Electron, so we defer
  // the filesystem walk to idle time without a fallback. Depends only on the folder path so editing
  // unrelated form fields doesn't re-walk the filesystem.
  useEffect(() => {
    if (!isWikiWorkspace(workspace) || isHtmlWikiWorkspace(workspace) || !wikiFolderLocation) return;
    let cancelled = false;
    const handle = window.requestIdleCallback(async () => {
      try {
        const repos = await window.service.git.discoverAncestorGitRepos(wikiFolderLocation);
        if (!cancelled) setAncestorRepos(repos);
      } catch {
        if (!cancelled) setAncestorRepos([]);
      }
    }, { timeout: 2000 });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(handle);
    };
  }, [wikiFolderLocation]);

  // Resolve the currently tracked repo root from the stored config in the main process.
  useEffect(() => {
    if (!isWikiWorkspace(workspace) || !wikiFolder) return;
    let cancelled = false;
    void (async () => {
      const scope = await window.service.git.getWorkspaceGitScope(workspace);
      if (!cancelled) setCurrentRepoPath(scope?.repoPath ?? wikiFolder);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, workspace.gitRepoPath, workspace.gitManagedRelativePath, wikiFolder]);

  if (!isWikiWorkspace(workspace) || isHtmlWikiWorkspace(workspace) || !wikiFolder) {
    return null;
  }

  // Candidates: the wiki folder (inner) first, then each strict ancestor repo. Dedup handles the
  // case where the wiki folder itself already has .git (it appears in ancestorRepos too).
  const candidates = useMemo(() => {
    if (ancestorRepos.length === 0) return [];
    return [...new Set<string>([wikiFolder, ...ancestorRepos])];
  }, [ancestorRepos, wikiFolder]);

  const currentSelection = currentRepoPath ?? wikiFolder;

  const handleSelect = async (repoRoot: string): Promise<void> => {
    if (!wikiFolderLocation) return;
    if (repoRoot === wikiFolder) {
      // Inner: clear scope, wiki folder is its own repo.
      workspaceSetter({ ...workspace, gitRepoPath: null, gitManagedRelativePath: null });
      return;
    }
    const scope = await window.service.git.computeGitScopePaths(wikiFolderLocation, repoRoot);
    workspaceSetter({ ...workspace, gitRepoPath: scope.gitRepoPath, gitManagedRelativePath: scope.gitManagedRelativePath });
  };

  return (
    <ListItemVertical>
      <ListItemText
        primary={t('EditWorkspace.GitRepoScopeTitle')}
        secondary={t('EditWorkspace.GitRepoScopeDescription')}
      />
      {candidates.length === 0
        ? (
          <Typography variant='body2' color='textSecondary' data-testid='git-repo-scope-empty'>
            {t('EditWorkspace.GitRepoScopeNoReposDetected')}
          </Typography>
        )
        : (
          <RadioGroup
            value={currentSelection}
            onChange={(_event, value: string) => {
              void handleSelect(value);
            }}
            data-testid='git-repo-scope-radio-group'
          >
            {candidates.map((repoRoot) => (
              <FormControlLabel
                key={repoRoot}
                value={repoRoot}
                control={<Radio size='small' />}
                label={repoRoot === wikiFolder
                  ? t('EditWorkspace.GitRepoScopeInner', { wikiFolder: repoRoot })
                  : t('EditWorkspace.GitRepoScopeAncestor', { repoPath: repoRoot })}
              />
            ))}
          </RadioGroup>
        )}
    </ListItemVertical>
  );
}
