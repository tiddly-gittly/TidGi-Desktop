# tidgi-shared

Shared service interfaces, IPC descriptors, and constants for TidGi plugins.

This package re-exports all TidGi Desktop service interface types so that external TiddlyWiki plugins and projects can reference them without depending on the full TidGi-Desktop codebase.

## Install

```bash
pnpm add tidgi-shared
```

## Usage

```typescript
import type { IGitServerService, IGitService, ITidGiGlobalService, IWorkspaceService } from 'tidgi-shared';
```

For TiddlyWiki route modules running in TidGi's wiki worker, access services via `$tw.tidgi.service`:

```typescript
import type { IGitServerService, IGitService, ITidGiGlobalService, IWorkspaceService } from 'tidgi-shared';

const tidgiService = ($tw as typeof $tw & { tidgi?: { service?: ITidGiGlobalService } }).tidgi?.service;
```

## Building

```bash
pnpm run build
```

## Releasing

`tidgi-shared` is built from the live interfaces in `TidGi-Desktop/src` via the aliases in `tsup.config.ts`, so release it only after the upstream service interfaces are already updated.

1. Update the source interfaces in `TidGi-Desktop/src/services/**/interface.ts`.
2. Bump the version in `packages/tidgi-shared/package.json`.
3. From the `TidGi-Desktop` repo root, run:

```bash
pnpm --filter tidgi-shared run check
pnpm --filter tidgi-shared run build
```

4. Optionally verify the tarball contents before publishing:

```bash
cd packages/tidgi-shared
npm pack --dry-run
```

5. Publish from `packages/tidgi-shared`:

```bash
npm publish --access public
```

6. Verify the published version:

```bash
npm view tidgi-shared version
```

If a plugin starts using a new TidGi service method and TypeScript cannot see it yet, that usually means the desktop source was updated but `tidgi-shared` has not been republished since that interface change.

## What's Included

- All TidGi service interfaces (25 services)
- IPC descriptors for electron-ipc-cat proxy
- Channel constants for IPC communication
- Shared types (`IService`, `SupportedStorageServices`, etc.)
- Window properties and metadata types
