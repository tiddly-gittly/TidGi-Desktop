# Service IPC

## Register a new service

See [this 6aedff4b commit](https://github.com/tiddly-gittly/TidGi-Desktop/commit/6aedff4bb2441e692c95aedc57a586953a641615) for example, you need to modify these files:

- [src/preload/common/services.ts](../../src/preload/common/services.ts) to expose it to renderer side for in-wiki plugin access
- [src/services/serviceIdentifier.ts](../../src/services/serviceIdentifier.ts) for IoC id
- [src/services/libs/bindServiceAndProxy.ts](../../src/services/libs/bindServiceAndProxy.ts) for dependency injection in inversifyjs

## Sync service

Some services are sync, like `getSubWorkspacesAsListSync` `getActiveWorkspaceSync` from `src/services/workspaces/index.ts`, they can't be called from renderer, only can be used in the main process.

Because after pass through IPC, everything will be async, so its function typescript signature will be wrong.

## Use async service on frontend

Given

```ts
export const WorkspaceServiceIPCDescriptor = {
  channel: WorkspaceChannel.name,
  properties: {
    workspaces$: ProxyPropertyType.Value$,
    getWorkspacesAsList: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    get$: ProxyPropertyType.Function$,
  },
};
```

Registered service's async method could be used like `await window.service.workspace.getWorkspacesAsList()`, and observable could be used as `window.observables.workspace.workspaces$.pipe()` (where pipe is a method on Observable on rxjs), and

```ts
import useObservable from 'beautiful-react-hooks/useObservable';

const workspace$ = useMemo(() => window.observables.workspace.get$(id), [id]);
useObservable(workspace$, workspaceSetter);
```

or in store use rxjs like `window.observables.workspace.get$(id).observe()`.
