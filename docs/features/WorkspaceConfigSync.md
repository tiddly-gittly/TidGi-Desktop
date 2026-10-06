# Workspace Configuration Sync

## Overview

This document describes how workspace configurations are stored and synced across devices. Some configurations are device-specific and stored locally, while others can be synced via Git through a `tidgi.config.json` file in the wiki folder.

## Configuration Categories

### Local-only Fields (stored in database)

These fields are device-specific and should NOT be synced:

| Field                | Reason                                             |
| -------------------- | -------------------------------------------------- |
| `id`                 | Unique identifier, different per installation      |
| `order`              | User preference for sidebar order, device-specific |
| `active`             | Current active state, runtime only                 |
| `hibernated`         | Current hibernation state, runtime only            |
| `lastUrl`            | Last visited URL, device-specific                  |
| `lastNodeJSArgv`     | Node.js arguments, may vary by device              |
| `homeUrl`            | Generated from workspace id                        |
| `authToken`          | Security token, should not be synced               |
| `picturePath`        | Local file path to workspace icon                  |
| `wikiFolderLocation` | Absolute path, different per device                |
| `port`              | Available HTTP port on this device                 |

### Syncable Fields (stored in tidgi.config.json)

These fields represent user preferences that should follow the wiki across devices:

| Field                        | Description                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `name`                       | Display name for the workspace                                                    |
| `isSubWiki`                  | Whether this workspace is a sub-wiki                                              |
| `mainWikiID`                 | Explicit link to the main workspace, validated against the local registry          |
| `gitUrl`                     | Git repository URL for syncing                                                    |
| `storageService`             | Storage service type (github, gitlab, local)                                      |
| `userName`                   | Git username for this workspace                                                   |
| `readOnlyMode`               | Whether wiki is in readonly mode                                                  |
| `tokenAuth`                  | Whether token authentication is enabled                                           |
| `enableHTTPAPI`              | Whether HTTP API is enabled                                                       |
| `enableFileSystemWatch`      | Whether file system watching is enabled                                           |
| `ignoreSymlinks`             | Whether to ignore symlinks in file watching                                       |
| `backupOnInterval`           | Whether to backup on interval                                                     |
| `syncOnInterval`             | Whether to sync on interval                                                       |
| `syncOnStartup`              | Whether to sync on startup                                                        |
| `disableAudio`               | Whether audio is disabled                                                         |
| `disableNotifications`       | Whether notifications are disabled                                                |
| `hibernateWhenUnused`        | Whether to hibernate when unused                                                  |
| `transparentBackground`      | Whether background is transparent                                                 |
| `excludedPlugins`            | List of plugins to exclude on startup                                             |
| `tagNames`                   | Tag names for sub-wiki routing                                                    |
| `includeTagTree`             | Whether to include tag tree for routing                                           |
| `fileSystemPathFilterEnable` | Whether path filter is enabled                                                    |
| `fileSystemPathFilter`       | Path filter expressions                                                           |
| `rootTiddler`                | Root tiddler for lazy loading                                                     |
| `https`                      | HTTPS configuration                                                               |
| `gitRepoPath`                | Git repo root relative to wiki folder (e.g. `..`); null = wiki folder is the repo |
| `gitManagedRelativePath`     | Wiki folder path relative to repo root; null = track whole repo                   |

## File Location

The syncable configuration is stored in:

```
{wikiFolderLocation}/tidgi.config.json
```

For main wikis, this is in the wiki root directory (alongside `tiddlywiki.info`).
For sub-wikis, this is in the sub-wiki folder (alongside tiddler files).

## File Exclusion

`tidgi.config.json` is excluded from being treated as a tiddler through multiple mechanisms:

1. **Main wiki**: The file is in wiki root, not in `tiddlers/` folder, so TiddlyWiki's boot process ignores it
2. **Sub-wiki loading**: [loadWikiTiddlersWithSubWikis.ts](../../src/services/wiki/wikiWorker/loadWikiTiddlersWithSubWikis.ts) explicitly skips files named `tidgi.config.json`
3. **File watcher**: [FileSystemWatcher.ts](../../src/services/wiki/plugin/watchFileSystemAdaptor/FileSystemWatcher.ts) has `tidgi.config.json` in `excludedFileNames` list

## File Format

```json
{
  "$schema": "https://tidgi.app/schemas/tidgi.config.schema.json",
  "version": 1,
  "name": "My Wiki",
  "storageService": "github",
  "gitUrl": "https://github.com/user/wiki.git",
  "readOnlyMode": false,
  "enableHTTPAPI": false
}
```

Only non-default values are saved to keep the file minimal. When loading, missing fields use defaults from `syncableConfigDefaultValues`.

## Loading Priority

When loading a workspace:

1. Decode the settings cache without reading wiki files synchronously.
2. Open the main window and start MCP and device networking.
3. Read `tidgi.config.json` files asynchronously, one at a time, with a bounded timeout.
4. Merge valid portable fields into the cache and resolve sub-wiki links.
5. Start wiki workers with the hydrated names, routing settings, and child list.

This ensures synced preferences take precedence over stale local values.

## Saving Behavior

When saving workspace config:

1. Persist explicit updates to the settings cache, keeping it usable without wiki filesystem access.
2. Write changed syncable fields to `tidgi.config.json` (only non-default values).
3. Publish the new in-memory state after persistence succeeds.

## Unavailable or Invalid Config

Missing or invalid files leave cached settings in place. Config files require a numeric `version`; a partial JSON object without it is not a valid portable config. A timed-out read stops the serial import to avoid exhausting filesystem workers. The application window and AI services remain available.

## Related Code

- [src/services/workspaces/interface.ts](../../src/services/workspaces/interface.ts) - Type definitions
- [src/services/workspaces/index.ts](../../src/services/workspaces/index.ts) - WorkspaceService implementation
- [src/services/database/tidgiConfig.ts](../../src/services/database/tidgiConfig.ts) - Portable config encoding and I/O
