# tidgi-shared

Shared service interfaces, IPC descriptors, and constants for TidGi plugins.

This package re-exports all TidGi Desktop service interface types so that external TiddlyWiki plugins and projects can reference them without depending on the full TidGi-Desktop codebase.

## Install

```bash
pnpm add tidgi-shared
```

## Usage

```typescript
import type { IGitServerService, IWorkspaceService, IGitService } from 'tidgi-shared';
```

For TiddlyWiki route modules running in TidGi's wiki worker, access services via `$tw.tidgi.service`:

```typescript
import type { IGitServerService, IWorkspaceService, IGitService } from 'tidgi-shared';

interface ITidGiGlobalService {
  gitServer?: IGitServerService;
  workspace: IWorkspaceService;
  git: IGitService;
}

const tidgiService = ($tw as typeof $tw & { tidgi?: { service?: ITidGiGlobalService } }).tidgi?.service;
```

## Building

```bash
pnpm run build
```

## What's Included

- All TidGi service interfaces (25 services)
- IPC descriptors for electron-ipc-cat proxy
- Channel constants for IPC communication
- Shared types (`IService`, `SupportedStorageServices`, etc.)
- Window properties and metadata types
