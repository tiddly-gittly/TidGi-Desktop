# Service IPC

## Sync service

Some services are sync, like `getSubWorkspacesAsListSync` `getActiveWorkspaceSync` from `src/services/workspaces/index.ts`, they can't be called from renderer, only can be used in the main process.

Because after pass through IPC, everything will be async, so its function typescript signature will be wrong.
