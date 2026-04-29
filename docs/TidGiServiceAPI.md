# TidGi Service API Usage

This document explains how TW plugins can call TidGi services and how the API is exposed across front-end and back-end.

## Where services are exposed

TidGi exposes the same service proxies in two places:

- Plugin runtime (TW sandbox): `$tw.tidgi.service`
- Frontend runtime (renderer): `window.service`

## Usage in plugins (TiddlyWiki modules)

TiddlyWiki modules should use `$tw.tidgi.service`. In the BrowserView (renderer) build, it is mounted during boot by a startup module. In the wiki worker build, it is attached before boot.

Example:

```ts
import type { ITidGiGlobalService } from 'tidgi-shared';

const tidgiService = ($tw as typeof $tw & { tidgi?: { service?: ITidGiGlobalService } }).tidgi?.service;
```

## Usage in renderer / WebView

Frontend UI code should keep using `window.service`.

```ts
await window.service.workspace.getActiveWorkspace();
```

## Usage for analytics

TidGi exposes `analytics` to both renderer code and TiddlyWiki plugins.

Use the guarded plugin-facing method for custom analytics:

```ts
await window.service.analytics.trackPluginEvent('my-plugin', 'panel_opened', {
  source: 'toolbar',
  has_selection: true,
});
```

Inside a TiddlyWiki plugin module:

```ts
const tidgiService = ($tw as typeof $tw & { tidgi?: { service?: ITidGiGlobalService } }).tidgi?.service;

await tidgiService?.analytics.trackPluginEvent('my-plugin', 'panel_opened', {
  source: 'toolbar',
  has_selection: true,
});
```

The final emitted event name becomes:

```text
plugin.my-plugin.panel_opened
```

### Analytics guardrails

- `pluginId` and `eventName` must be lowercase slug-like identifiers
- Property keys must be short snake_case-style identifiers
- Property values must be `string | number | boolean`
- Do not send note text, tiddler titles, workspace names, file paths, tokens, or raw URLs

See [Analytics.md](./Analytics.md) for the full analytics contract.

## How the API is wired

- Service proxies are created in the wiki worker and preload using `electron-ipc-cat`.
- Renderer (BrowserView): `src/preload/common/exportServices.ts` exposes proxies via `contextBridge` and assigns `window.service`.
- Renderer (BrowserView): `src/services/wiki/plugin/ipcSyncAdaptor/Startup/mount-tidgi-service.ts` (published as a startup module) mounts `window.service` to `$tw.tidgi.service` during TiddlyWiki boot.
- Wiki worker: `src/services/wiki/wikiWorker/startNodeJSWiki.ts` attaches the same proxies to `$tw.tidgi.service` before TiddlyWiki boot, so modules can access them inside the worker.

## Types for plugins

Use `tidgi-shared` for type-safe access. It also augments the global `$tw` shape so editors can resolve `$tw.tidgi.service`:

```ts
import type { IWorkspaceService } from 'tidgi-shared';
```

This package re-exports all service interfaces and IPC descriptors used by TidGi.
