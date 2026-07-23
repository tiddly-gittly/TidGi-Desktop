import { FormControlLabel, ListItemText, Radio, RadioGroup, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { computeGitScopePaths } from '@/windows/GitLog/workspaceGitScope';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { isHtmlWikiWorkspace } from '@services/workspaces/workspacePaths';
import { ListItemVertical } from '../../Preferences/PreferenceComponents';
import { useWorkspaceForm } from '../WorkspaceFormContext';

/**
 * Workspace settings item that lets the user choose which Git repository layer TidGi tracks for
 * this wiki. Detects ancestor Git repos and offers the wiki folder itself plus every ancestor as
 * candidates. Stores the choice as portable relative paths (`gitRepoPath`/`gitManagedRelativePath`)
 * in the workspace config so it follows the wiki across devices.
 */
export function GitRepoScopeItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const [ancestorRepos, setAncestorRepos] = useState<string[]>([]);

  useEffect(() => {
    if (!isWikiWorkspace(workspace) || isHtmlWikiWorkspace(workspace)) return;
    void (async () => {
      try {
        // Walk up from the wiki folder; the first result is the wiki folder itself if it has .git.
        const repos = await window.service.git.discoverAncestorGitRepos(workspace.wikiFolderLocation);
        setAncestorRepos(repos);
      } catch {
        setAncestorRepos([]);
      }
    })();
  }, [workspace, workspace.wikiFolderLocation]);

  const wikiFolderLocation = isWikiWorkspace(workspace) ? workspace.wikiFolderLocation : undefined;
  if (!isWikiWorkspace(workspace) || isHtmlWikiWorkspace(workspace) || !wikiFolderLocation) {
    return null;
  }

  // Build the candidate list: the wiki folder itself (inner) + each strict ancestor repo.
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (ancestorRepos.length === 0) return list;
    const wikiRepoIndex = ancestorRepos.indexOf(wikiFolderLocation);
    if (wikiRepoIndex >= 0) {
      list.push(wikiFolderLocation);
      list.push(...ancestorRepos.filter((repo) => repo !== wikiFolderLocation));
    } else {
      // Wiki folder has no .git of its own; still offer it as "inner (will create)" option.
      list.push(wikiFolderLocation);
      list.push(...ancestorRepos);
    }
    return list;
  }, [ancestorRepos, wikiFolderLocation]);

  // Determine the currently selected repo root from the stored config.
  const currentSelection = useMemo(() => {
    const configuredRepoPath = workspace.gitRepoPath;
    if (typeof configuredRepoPath !== 'string' || configuredRepoPath.trim() === '' || configuredRepoPath.trim() === '.') {
      return wikiFolderLocation;
    }
    // Resolve the configured relative path back to an absolute ancestor for matching the radio.
    const wikiSegs = wikiFolderLocation.replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter((s) => s.length > 0 && !/^[A-Za-z]:$/.test(s));
    const upCount = configuredRepoPath.replace(/\\/g, '/').split('/').filter((s) => s === '..').length;
    const repoSegs = wikiSegs.slice(0, Math.max(0, wikiSegs.length - upCount));
    const isWindowsAbsolute = /^[A-Za-z]:/.test(wikiFolderLocation);
    const resolved = (isWindowsAbsolute ? '' : '/') + repoSegs.join('/');
    return candidates.includes(resolved) ? resolved : wikiFolderLocation;
  }, [workspace.gitRepoPath, wikiFolderLocation, candidates]);

  const handleSelect = (repoRoot: string): void => {
    if (repoRoot === wikiFolderLocation) {
      // Inner: clear scope, wiki folder is its own repo.
      workspaceSetter({ ...workspace, gitRepoPath: null, gitManagedRelativePath: null });
      return;
    }
    const scope = computeGitScopePaths(wikiFolderLocation, repoRoot);
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
              handleSelect(value);
            }}
            data-testid='git-repo-scope-radio-group'
          >
            {candidates.map((repoRoot) => (
              <FormControlLabel
                key={repoRoot}
                value={repoRoot}
                control={<Radio size='small' />}
                label={repoRoot === wikiFolderLocation
                  ? t('EditWorkspace.GitRepoScopeInner', { wikiFolder: repoRoot })
                  : t('EditWorkspace.GitRepoScopeAncestor', { repoPath: repoRoot })}
              />
            ))}
          </RadioGroup>
        )}
    </ListItemVertical>
  );
}
