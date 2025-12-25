# Sync Architecture: IPC and Watch-FS Plugins

This document describes how the `tidgi-ipc-syncadaptor` (frontend) and `watch-filesystem-adaptor` (backend) plugins work together to provide real-time bidirectional synchronization between the TiddlyWiki in-memory store and the file system.

## Architecture Overview

```chart
Frontend (Browser)          Backend (Node.js Worker)
┌─────────────────┐        ┌──────────────────────┐
│ TiddlyWiki      │        │ TiddlyWiki (Server)  │
│ In-Memory Store │◄──────►│ File System Adaptor  │
└────────┬────────┘        └──────────┬───────────┘
         │                            │
         │ IPC Sync                   │ Watch-FS
         │ Adaptor                    │ Adaptor
         │                            │
         ├─ Save to FS ──────────────►│
         │                            │
         │◄───── SSE Events ──────────┤
         │     (File Changes)         │
         │                            │
         │                            ├─ nsfw Watcher
         │                            │  (File System)
         └────────────────────────────┘
```

## Key Design Principles

### 1. Single Source of Truth: File System

- Backend watch-fs monitors the file system using `nsfw` library
- All file changes (external edits, saves from frontend) flow through file system
- Backend wiki state reflects file system state

### 2. Two-Layer Echo Prevention

**IPC Layer (First Defense)**:

- `ipcServerRoutes.ts` tracks recently saved tiddlers in `recentlySavedTiddlers` Set
- When `wiki.addTiddler()` triggers change event, filter out tiddlers in the Set
- Prevents frontend from receiving its own save operations as change notifications

**Watch-FS Layer (Second Defense)**:

- When saving/deleting, watch-fs temporarily excludes file from monitoring via custom exclusion list
- Prevents watcher from detecting the file write operation
- Re-includes file immediately after operation completes (no delay)
- Combined with IPC filtering, ensures no echo even for rapid successive saves

### 3. SSE-like Change Notification (IPC Observable)

- Backend sends change events to frontend via IPC (not real SSE, but Observable pattern via `ipc-cat`)
- Frontend subscribes to `getWikiChangeObserver$` observable from `window.observables.wiki`
- Change events trigger tw's `syncFromServer()` to pull updates from backend, it will in return call our `getUpdatedTiddlers`

## Plugin Responsibilities

### Frontend: `tidgi-ipc-syncadaptor`

Purpose: Bridge between frontend TiddlyWiki and backend file system

IPC Communication Flow:

- Frontend plugin calls `window.service.wiki` methods (provided by preload script)
- Preload script uses `setupIpcServerRoutesHandlers.ts` (runs in view context) to set up IPC protocol handlers
- These handlers forward requests to `ipcServerRoutes.ts` in wiki worker via IPC
- Uses `tidgi://` custom protocol for RESTful-like API

Key Functions:

- `saveTiddler()`: Send tiddler to backend via IPC → `putTiddler` in `ipcServerRoutes.ts`
- `loadTiddler()`: Request tiddler from backend via IPC → `getTiddler` in `ipcServerRoutes.ts`
- `deleteTiddler()`: Request deletion via IPC → `deleteTiddler` in `ipcServerRoutes.ts`
- `setupSSE()`: Subscribe to file change events from backend (via IPC Observable, not real SSE)
- `getUpdatedTiddlers()`: Provide list of changed tiddlers to syncer

Echo Prevention Strategy:

Frontend plugin does NOT implement echo detection because:

1. Cannot distinguish between "save to fs and watch fs echo back" and "external user text edit with unchanged 'modified' timestamp metadata"
2. Echo prevention is handled by backend at two levels:
   - **IPC level**: `ipcServerRoutes.ts` filters out change events from IPC saves using `recentlySavedTiddlers` Set
   - **Watch-FS level**: `watch-filesystem-adaptor` temporarily excludes files during save operations

### Backend: `watch-filesystem-adaptor`

Purpose: Monitor file system and maintain wiki state

Key Functions:

- `saveTiddler()`: Write to file system with temporary exclusion; automatically move external attachment files when tiddler routes to different workspace
- `deleteTiddler()`: Remove file with temporary exclusion
- `initializeFileWatching()`: Setup `nsfw` watcher for main wiki and sub-wikis
- `handleFileAddOrChange()`: Load changed files into wiki
- `handleFileDelete()`: Remove deleted tiddlers from wiki

External Attachment Handling:

- `$tw.utils.moveExternalAttachmentIfNeeded()`: Moves external attachment files (referenced by `_canonical_uri`) when tiddler is routed to different workspace based on tag changes
- Integrated into `saveTiddler()` - runs automatically after tiddler file is saved but before cleanup
- Uses same routing logic as tiddler files to determine source and target workspace

Two-Layer Echo Prevention:

#### Layer 1: IPC Level (in ipcServerRoutes.ts)

```typescript
async putTiddler(title, fields) {
  // Mark as recently saved to prevent echo
  this.recentlySavedTiddlers.add(title);
  
  // This triggers 'change' event synchronously
  this.wikiInstance.wiki.addTiddler(new Tiddler(fields));
  
  // Change event handler filters it out and removes the mark
}

// Change event handler
wiki.addEventListener('change', (changes) => {
  const filteredChanges = {};
  for (const title in changes) {
    if (this.recentlySavedTiddlers.has(title)) {
      // Filter out echo from IPC save
      this.recentlySavedTiddlers.delete(title);
      continue;
    }
    filteredChanges[title] = changes[title];
  }
  // Only send filtered changes to frontend
  observer.next(filteredChanges);
});
```

#### Layer 2: Watch-FS Level (in WatchFileSystemAdaptor.ts)

Watch-FS uses a custom exclusion list to prevent detecting its own file operations, and delays DELETE events to handle git operations gracefully.

**Save/Delete Flow:**

```typescript
async saveTiddler(tiddler) {
  const filepath = await this.getTiddlerFileInfo(tiddler);
  
  // 1. Exclude file BEFORE saving (added to custom exclusion list)
  await this.excludeFile(filepath);
  
  // 2. Save to file system (calls parent saveTiddler)
  await super.saveTiddler(tiddler);
  
  // 3. Re-include IMMEDIATELY after save completes
  await this.includeFile(filepath);
  // File is now ready to detect external changes
}
```

**Event Processing with DELETE Delay:**

```typescript
handleNsfwEvents(events) {
  events.forEach(event => {
    const filepath = path.join(event.directory, event.file);
    
    // Check custom exclusion list at handler level
    if (this.inverseFilesIndex.isFileExcluded(filepath)) {
      // Skip if file is excluded (being saved/deleted by us)
      return;
    }
    
    if (event.action === 'DELETED') {
      // Delay deletion by 100ms to handle git revert/checkout
      // Git operations delete then recreate files quickly
      this.scheduleDeletion(filepath, 100);
    } else if (event.action === 'CREATED' || event.action === 'MODIFIED') {
      // Cancel any pending deletion for this file
      this.cancelPendingDeletion(filepath);
      
      // Load changed file into wiki
      const tiddler = $tw.loadTiddlersFromFile(filepath);
      $tw.syncadaptor.wiki.addTiddler(tiddler);
    }
  });
}
```

**Git Operation Handling:**

When `git revert` or `git checkout` executes, files are deleted then recreated:

1. DELETE event → Scheduled for processing after 100ms delay
2. CREATE event (file recreated) → Cancels pending deletion
3. Result: Treated as file modification, not deletion + creation
4. Prevents tiddlers from showing as "missing" (佚失) during git operations

## Data Flow Examples

### Example 1: User Edits in Frontend

```text
1. User clicks save in browser
   ├─► Frontend: saveTiddler() called
   │
2. IPC call to backend
   ├─► Backend: receives putTiddler request
   │
3. Backend IPC layer: Mark tiddler in recentlySavedTiddlers
   ├─► ipcServerRoutes.ts adds title to Set
   │
4. Backend: wiki.addTiddler(tiddler)
   ├─► Triggers 'change' event
   ├─► Event handler checks recentlySavedTiddlers
   ├─► Filters out this change (IPC echo prevention)
   ├─► Removes title from recentlySavedTiddlers
   │
5. Backend Watch-FS layer: excludeFile(filepath)
   ├─► File added to custom exclusion list
   │
6. Backend: write to file system
   ├─► File content updated on disk
   │
7. nsfw detects file change
   ├─► handleNsfwEvents checks custom exclusion list
   ├─► File is excluded, change event ignored (Watch-FS echo prevention)
   │
8. Immediately after save completes
   ├─► includeFile(filepath) removes from exclusion list
   ├─► File ready to detect external changes
```

### Example 2: External Editor Modifies File

```text
1. User edits file in VSCode/Vim
   ├─► File content changes on disk
   │
2. nsfw detects file change
   ├─► File NOT in excludedFiles (not being saved)
   │
3. handleFileAddOrChange() called
   ├─► Load tiddler from file
   ├─► wiki.addTiddler(tiddler)
   │
4. Wiki fires 'change' event
   ├─► ipcServerRoutes.ts checks recentlySavedTiddlers
   ├─► Title NOT in Set (external edit, not IPC save)
   ├─► Change passes through filter
   ├─► IPC Observable sends event to frontend (via ipc-cat)
   │
5. Frontend receives change event
   ├─► Adds to updatedTiddlers.modifications
   ├─► Triggers syncFromServer()
   │
6. Frontend: loadTiddler() via IPC
   ├─► Gets latest tiddler from backend
   ├─► Updates frontend wiki
   ├─► UI re-renders with new content
```

### Example 3: Sub-Wiki Synchronization

```text
1. Main wiki has sub-wiki folder linked by tag
   ├─► watch-fs detects sub-wiki in tiddlywiki.info
   │
2. watch-fs starts additional watcher
   ├─► Monitors SubWiki/ folder
   │
3. User saves tiddler with tag in frontend
   ├─► Backend determines file should go to SubWiki/
   ├─► Saves to SubWiki/Tiddler.tid
   │
4. Sub-wiki watcher detects new file
   ├─► (Excluded during save, so no echo)
   │
5. External edit in SubWiki/Tiddler.tid
   ├─► Sub-wiki watcher detects change
   ├─► Updates main wiki's in-memory store
   ├─► IPC Observable notifies frontend
   ├─► Frontend syncs and displays update
```

## Key Configuration

### File Exclusion and Event Handling

- Custom exclusion list checked at event handler level (not using nsfw's native excludedPaths API)
- Files are re-included immediately after save/delete operations complete
- `FILE_DELETION_DELAY_MS = 100`: Delay before processing DELETE events to handle git revert/checkout
- Prevents echo while allowing immediate re-detection of external changes

### SSE-like Debouncing (IPC Observable)

- `debounce(syncFromServer, 500)`: Batch multiple file changes
- Reduces unnecessary sync operations

### Syncer Polling

- `pollTimerInterval = 2_147_483_647`: Effectively disable polling
- All updates come via IPC Observable (event-driven, not polling)

## Troubleshooting

### Changes Not Appearing in Frontend

1. Check IPC Observable connection: Look for `[test-id-SSE_READY]` in logs
2. Verify watch-fs is running: Look for `[test-id-WATCH_FS_STABILIZED]`
3. Check file exclusion: Should see `[WATCH_FS_EXCLUDE]` and `[WATCH_FS_INCLUDE]`

### Echo/Duplicate Updates

1. Check exclusion list: Files should be excluded during save/delete operations
2. Verify no multiple watchers on same path
3. Ensure frontend isn't doing its own timestamp-based filtering

### Sub-Wiki Not Syncing

1. Check sub-wiki detection: Look for `[WATCH_FS_SUBWIKI]` logs
2. Verify tiddlywiki.info has correct configuration
3. Check workspace `subWikiFolders` setting

### Not Recommended

- ❌ Timestamp-based echo detection (already tried, unreliable)
- ❌ Frontend-side file watching (duplicates backend effort)
- ❌ Polling-based synchronization (SSE is better)
