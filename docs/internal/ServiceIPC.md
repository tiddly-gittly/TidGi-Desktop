# Service IPC

## Register a new service

See [this 6aedff4b commit](https://github.com/tiddly-gittly/TidGi-Desktop/commit/6aedff4bb2441e692c95aedc57a586953a641615) for example, you need to modify these files:

- [src/preload/common/services.ts](../../src/preload/common/services.ts) to expose it to renderer side for in-wiki plugin access
- [src/services/libs/bindServiceAndProxy.ts](../../src/services/libs/bindServiceAndProxy.ts) for dependency injection in inversifyjs
- [src/services/serviceIdentifier.ts](../../src/services/serviceIdentifier.ts) for IoC id

## Sync service

Some services are sync, like `getSubWorkspacesAsListSync` `getActiveWorkspaceSync` from `src/services/workspaces/index.ts`, they can't be called from renderer, only can be used in the main process.

Because after pass through IPC, everything will be async, so its function typescript signature will be wrong.
