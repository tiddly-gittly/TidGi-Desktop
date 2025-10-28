# Service IPC

## Register a new service

See [this 6aedff4b commit](https://github.com/tiddly-gittly/TidGi-Desktop/commit/6aedff4bb2441e692c95aedc57a586953a641615) for example, you need to modify these files:

- [src/preload/common/services.ts](../../src/preload/common/services.ts) to expose it to renderer side for in-wiki plugin access
- [src/services/serviceIdentifier.ts](../../src/services/serviceIdentifier.ts) for IoC id
- [src/services/libs/bindServiceAndProxy.ts](../../src/services/libs/bindServiceAndProxy.ts) for dependency injection in inversifyjs

## Register service for worker threads

If you need to expose a service to worker threads (e.g., for TiddlyWiki plugins running in wiki worker), register it in the `registerServicesForWorkers()` function in [src/services/libs/bindServiceAndProxy.ts](../../src/services/libs/bindServiceAndProxy.ts).

Example:

```typescript
function registerServicesForWorkers(workspaceService: IWorkspaceService): void {
  registerServiceForWorker('workspace', {
    get: workspaceService.get.bind(workspaceService) as (...arguments_: unknown[]) => unknown,
    getWorkspacesAsList: workspaceService.getWorkspacesAsList.bind(workspaceService) as (...arguments_: unknown[]) => unknown,
  });
}
```

Worker threads can then call these services using:

```typescript
import { callMainProcessService } from '@services/wiki/wikiWorker/workerServiceCaller';

const workspace = await callMainProcessService<IWorkspace>('workspace', 'get', [workspaceId]);
const allWorkspaces = await callMainProcessService<IWorkspace[]>('workspace', 'getWorkspacesAsList', []);
```

See [src/services/wiki/wikiWorker/workerServiceCaller.ts](../../src/services/wiki/wikiWorker/workerServiceCaller.ts) for the worker-side implementation.

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

## IPC Communication Architecture

TidGi uses multiple IPC mechanisms for different scenarios:

### 1. Main Process ↔ Renderer Process (electron-ipc-cat)

Used for UI-related service calls (e.g., preferences, workspaces, windows).

- **Registration**: `src/services/libs/bindServiceAndProxy.ts` - `registerProxy()`
- **Renderer access**: `window.service.*` or `window.observables.*`
- **Implementation**: electron-ipc-cat library

### 2. Main Process ↔ Worker Threads (worker_threads)

Used for TiddlyWiki plugins running in wiki workers to access TidGi services.

- **Registration**: `src/services/libs/bindServiceAndProxy.ts` - `registerServicesForWorkers()`
- **Worker access**: `callMainProcessService(serviceName, methodName, args)`
- **Implementation**: Custom worker_threads IPC in `src/services/libs/workerAdapter.ts`
- **Use case**: Watch Filesystem Adaptor plugin querying workspace information

Key differences:

- Worker IPC is **method-based** (not proxy-based)
- Worker IPC is **async only** (no observables)
- Worker IPC requires **explicit registration** of each method
