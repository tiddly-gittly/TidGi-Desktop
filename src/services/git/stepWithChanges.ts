import { GitStep } from 'git-sync-js';

// TODO: move this to git-sync-js
export const stepWithChanges = [GitStep.GitMerge, GitStep.LocalStateDivergeRebase, GitStep.LocalStateBehindSync];
