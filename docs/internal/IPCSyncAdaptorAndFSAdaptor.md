# Sync Architecture: IPC and Watch-FS Plugins

This document describes how the `tidgi-ipc-syncadaptor` (frontend) and `watch-filesystem-adaptor` (backend) plugins work together to provide real-time bidirectional synchronization between the TiddlyWiki in-memory store and the file system.

## Architecture Overview

```
Frontend (Browser)                    Backend (Node.js Worker)
┌─────────────────────────────┐      ┌─────────────────────────────────────┐
│ TiddlyWiki                  │      │ TiddlyWiki (Server)                 │
│ In-Memory Store             │      │ In-Memory Store                     │
└──────────┬──────────────────┘      └──────────┬──────────────────────────┘
           │                                    │
           │ TidGiIPCSyncAdaptor                │ WatchFileSystemAdaptor
           │ (syncadaptor)                      │ (syncadaptor)
           │                                    │
           │                                    ├── FileSystemWatcher
           │                                    │   (monitors files via nsfw)
           │                                    │
           ├─── Save via IPC ──────────────────►│
           │                                    │
           │◄────── IPC Observable ─────────────┤
           │        (Change Events)             │
           │                                    │
           │                                    ├── FileSystemAdaptor
           │                                    │   (read/write files)
           │                                    │
           │                                    ▼
           │                                 File System
           └────────────────────────────────────┘
```

## Key Design Principles

### 1. Single Source of Truth: File System

- Backend watch-fs monitors the file system using `nsfw` library
- All file changes (external edits, saves from frontend) flow through file system
- Backend wiki state reflects file system state

### 2. Syncer-Driven Updates (Refactored Architecture)

**Previous Approach (Problematic):**

- FileSystemWatcher directly called `wiki.addTiddler()` when files changed
- Led to echo problems and complex edge case handling

**Current Approach (Syncer-Driven):**

- FileSystemWatcher only collects changes into `updatedTiddlers` list
- Triggers `$tw.syncer.syncFromServer()` to let TiddlyWiki's syncer handle updates
- Syncer calls `getUpdatedTiddlers()` to get change list
- Syncer calls `loadTiddler()` for each modified tiddler
- Syncer uses `storeTiddler()` which properly updates changeCount to prevent echo

Benefits:

- Leverages TiddlyWiki's built-in sync queue and throttling
- Proper handling of batch changes (git checkout)
- Eliminates echo loops via syncer's changeCount tracking

### 3. Two-Layer Echo Prevention

**IPC Layer (First Defense)**:

- `ipcServerRoutes.ts` tracks recently saved tiddlers in `recentlySavedTiddlers` Set
- When `wiki.addTiddler()` triggers change event, filter out tiddlers in the Set
- Prevents frontend from receiving its own save operations as change notifications

**Watch-FS Layer (Second Defense)**:

- When saving/deleting, watch-fs temporarily excludes file from monitoring
- Prevents watcher from detecting the file write operation
- Re-includes file after operation completes (with delay for nsfw debounce)

### 4. IPC Observable for Change Notification

- Backend sends change events to frontend via IPC Observable pattern (via `ipc-cat`)
- Frontend subscribes to `getWikiChangeObserver$` observable from `window.observables.wiki`
- Change events trigger frontend's `syncFromServer()` to pull updates

## Module Responsibilities

### FileSystemWatcher (Backend - New)

**Purpose:** Monitor file system changes without directly modifying wiki state

**Key Features:**

- Uses `nsfw` library for native file system watching
- Maintains `updatedTiddlers` list for pending changes
- Implements `getUpdatedTiddlers()` for syncer integration
- Implements `loadTiddler()` for lazy loading from file system
- Handles git revert/checkout via delayed deletion processing
- Manages file exclusion list for echo prevention

**Key Methods:**

- `getUpdatedTiddlers(syncer, callback)`: Returns collected changes
- `loadTiddler(title, callback)`: Loads tiddler content from file
- `excludeFile(path)`: Temporarily exclude file from watching
- `scheduleFileInclusion(path)`: Re-include file after delay

### WatchFileSystemAdaptor (Backend)

**Purpose:** Coordinate between FileSystemWatcher and syncer, implement syncadaptor interface

**Key Features:**

- Extends FileSystemAdaptor for file save/delete operations
- Delegates file watching to FileSystemWatcher
- Implements full syncadaptor interface for Node.js syncer
- Coordinates file exclusion during save/delete operations

**Key Methods:**

- `getUpdatedTiddlers()`: Delegates to FileSystemWatcher
- `loadTiddler()`: Delegates to FileSystemWatcher
- `saveTiddler()`: Saves to file with exclusion handling
- `deleteTiddler()`: Deletes file with exclusion handling

### FileSystemAdaptor (Backend - Base Class)

**Purpose:** Handle tiddler file save/delete operations with sub-wiki routing

**Key Features:**

- Routes tiddlers to sub-wikis based on tags
- Generates file paths using TiddlyWiki's FileSystemPaths
- Handles external attachment file movement
- Provides retry logic for file lock errors

### TidGiIPCSyncAdaptor (Frontend)

**Purpose:** Bridge between frontend TiddlyWiki and backend file system

**Key Features:**

- Communicates via IPC using `tidgi://` custom protocol
- Subscribes to change events via IPC Observable
- Maintains `updatedTiddlers` list from IPC events
- Implements full syncadaptor interface for browser syncer

## Data Flow Examples

### Example 1: User Edits in Frontend

```
1. User clicks save in browser
   ├─► Frontend syncer calls saveTiddler()
   │
2. TidGiIPCSyncAdaptor.saveTiddler()
   ├─► IPC call to putTiddler in ipcServerRoutes.ts
   │
3. ipcServerRoutes.putTiddler()
   ├─► Marks tiddler in recentlySavedTiddlers (IPC echo prevention)
   ├─► Calls wiki.addTiddler() (triggers change event)
   ├─► Change event filtered by recentlySavedTiddlers
   │
4. Backend syncer detects change
   ├─► Calls WatchFileSystemAdaptor.saveTiddler()
   │
5. WatchFileSystemAdaptor.saveTiddler()
   ├─► Excludes file path from watching
   ├─► Calls FileSystemAdaptor.saveTiddler()
   ├─► Writes file to disk
   ├─► Schedules file re-inclusion after delay
   │
6. nsfw might detect file change
   ├─► FileSystemWatcher checks exclusion list
   ├─► File is excluded, event ignored
```

### Example 2: External Editor Modifies File

```
1. User edits file in VSCode/Vim
   ├─► File content changes on disk
   │
2. nsfw detects file change
   ├─► File NOT in excludedFiles
   │
3. FileSystemWatcher.handleFileAddOrChange()
   ├─► Adds title to updatedTiddlers.modifications
   ├─► Stores file info in pendingFileLoads
   ├─► Schedules syncer trigger (debounced 200ms)
   │
4. $tw.syncer.syncFromServer() called
   ├─► Creates SyncFromServerTask
   │
5. SyncFromServerTask.run()
   ├─► Calls getUpdatedTiddlers()
   ├─► Gets modifications/deletions list
   ├─► Adds titles to titlesToBeLoaded
   │
6. For each title to load:
   ├─► LoadTiddlerTask.run()
   ├─► Calls loadTiddler(title)
   ├─► FileSystemWatcher loads from file
   ├─► syncer.storeTiddler() updates wiki
   ├─► Properly sets changeCount (prevents echo save)
   │
7. wiki.addTiddler() triggers change event
   ├─► getWikiChangeObserver sends to frontend
   │
8. Frontend receives change
   ├─► TidGiIPCSyncAdaptor adds to updatedTiddlers
   ├─► Frontend syncer.syncFromServer()
   ├─► Frontend loadTiddler() via IPC
   ├─► Frontend wiki updated
```

### Example 3: Git Checkout (Batch Changes)

```
1. User runs git checkout
   ├─► Many files deleted/created/modified
   │
2. nsfw debounces events (100ms)
   ├─► Multiple events batched together
   │
3. FileSystemWatcher.handleNsfwEvents()
   ├─► For each DELETED file:
   │   └─► Schedule deletion with 100ms delay
   │       (handles git revert/checkout pattern)
   ├─► For each CREATED/MODIFIED file:
   │   └─► Cancel any pending deletion for same path
   │   └─► Add to updatedTiddlers.modifications
   │
4. Syncer trigger debounced (200ms)
   ├─► All changes collected before sync starts
   │
5. Single SyncFromServerTask processes all changes
   ├─► All modifications queued for loading
   ├─► All deletions processed (wiki.deleteTiddler)
   │
6. LoadTiddlerTasks process sequentially
   ├─► Each tiddler loaded from file
   ├─► Frontend notified via IPC Observable
```

## Key Configuration

### Timing Constants

```typescript
// FileSystemWatcher.ts
FILE_DELETION_DELAY_MS = 100    // Delay before processing DELETE events
FILE_INCLUSION_DELAY_MS = 150   // Delay before re-including file after save
GIT_NOTIFICATION_DELAY_MS = 1000 // Debounce for git status notification
SYNCER_TRIGGER_DELAY_MS = 200   // Debounce for syncer trigger
```

### Syncer Configuration

- Frontend: `pollTimerInterval = 2_147_483_647` (effectively disabled)
- All updates come via IPC Observable (event-driven)

## Troubleshooting

### Changes Not Appearing in Frontend

1. Check IPC Observable connection: Look for `[test-id-SSE_READY]` in logs
2. Verify watch-fs is running: Look for `[test-id-WATCH_FS_STABILIZED]`
3. Check file exclusion: Should see file being excluded then included

### Echo/Duplicate Updates

1. Check `recentlySavedTiddlers` filtering in ipcServerRoutes.ts
2. Verify file exclusion during save/delete operations
3. Check syncer's changeCount tracking

### Git Checkout Issues

1. Ensure FILE_DELETION_DELAY_MS is working (files not prematurely deleted)
2. Check that SYNCER_TRIGGER_DELAY_MS allows batch collection
3. Verify syncer processes all changes in single SyncFromServerTask

### Sub-Wiki Not Syncing

1. Check sub-wiki watcher initialization: Look for `[WATCH_FS_SUBWIKI]` logs
2. Verify tiddlywiki.info has correct configuration
3. Check workspace `subWikiFolders` setting

## Design Decisions

### Why Syncer-Driven Instead of Direct Updates?

1. **Echo Prevention**: Syncer's `storeTiddler()` properly updates changeCount, preventing save loops
2. **Batch Handling**: Syncer queues all changes and processes them sequentially
3. **Throttling**: Built-in throttle prevents rapid-fire saves
4. **Error Recovery**: Syncer has built-in retry logic

### Why Two-Layer Echo Prevention?

1. **IPC Layer**: Prevents frontend from seeing its own saves via IPC
2. **Watch-FS Layer**: Prevents file watcher from seeing our own file writes
3. **Both needed**: IPC prevents wiki→wiki echo, Watch-FS prevents file→wiki echo

### Why Delay DELETE Events?

Git operations often delete then recreate files quickly. The delay allows:

1. CREATE event to arrive and cancel pending DELETE
2. Treat as modification instead of delete+create
3. Prevents "missing tiddler" errors during git operations
