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

### 2. Echo Prevention via File Exclusion

- When saving a tiddler, watch-fs temporarily excludes the file from monitoring
- Exclusion lasts for `FILE_EXCLUSION_CLEANUP_DELAY_MS` (200ms)
- This prevents the save operation from triggering a change event (echo)
- No timestamp-based equality check or echo detection needed - simpler and more reliable

### 3. SSE-like Change Notification (IPC Observable)

- Backend sends change events to frontend via IPC (not real SSE, but Observable pattern via `ipc-cat`)
- Frontend subscribes to `getWikiChangeObserver$` observable from `window.observables.wiki`
- Change events trigger tw's `syncFromServer()` to pull updates from backend, it will in return call our `getUpdatedTiddlers`

## Plugin Responsibilities

### Frontend: `tidgi-ipc-syncadaptor`

Purpose: Bridge between frontend TiddlyWiki and backend file system

Key Functions:

- `saveTiddler()`: Send tiddler to backend via IPC → backend saves to file
- `loadTiddler()`: Request tiddler from backend via IPC
- `deleteTiddler()`: Request deletion via IPC
- `setupSSE()`: Subscribe to file change events from backend (via IPC Observable, not real SSE)
- `getUpdatedTiddlers()`: Provide list of changed tiddlers to syncer

No Echo Detection:

1. Cannot distinguish between "save to fs and watch fs echo back" and "external user text edit with unchanged 'modified' timestamp metadata"
2. Watch-fs exclusion mechanism already prevents echoes at the source

### Backend: `watch-filesystem-adaptor`

Purpose: Monitor file system and maintain wiki state

Key Functions:

- `saveTiddler()`: Write to file system with temporary exclusion
- `deleteTiddler()`: Remove file with temporary exclusion
- `initializeFileWatching()`: Setup `nsfw` watcher for main wiki and sub-wikis
- `handleFileAddOrChange()`: Load changed files into wiki
- `handleFileDelete()`: Remove deleted tiddlers from wiki

Echo Prevention Flow:

```typescript
async saveTiddler(tiddler) {
  const filepath = await this.getTiddlerFileInfo(tiddler);
  
  // 1. Exclude file BEFORE saving
  await this.excludeFile(filepath);
  
  // 2. Save to file system
  await super.saveTiddler(tiddler);
  
  // 3. Re-include after delay
  setTimeout(() => {
    this.includeFile(filepath);
  }, FILE_EXCLUSION_CLEANUP_DELAY_MS);
}
```

File Change Flow:

```typescript
handleNsfwEvents(events) {
  events.forEach(event => {
    const filepath = path.join(event.directory, event.file);
    
    // Skip if file is excluded (being saved)
    if (this.excludedFiles.has(filepath)) return;
    
    // Load changed file into wiki
    const tiddler = $tw.loadTiddlersFromFile(filepath);
    $tw.syncadaptor.wiki.addTiddler(tiddler);
    
    // Wiki change event fires → SSE sends to frontend
  });
}
```

## Data Flow Examples

### Example 1: User Edits in Frontend

```
1. User clicks save in browser
   ├─► Frontend: saveTiddler() called
   │
2. IPC call to backend
   ├─► Backend: receives putTiddler request
   │
3. Backend: excludeFile(filepath)
   ├─► File added to excludedFiles set
   │
4. Backend: write to file system
   ├─► File content updated on disk
   │
5. nsfw detects file change
   ├─► But file is in excludedFiles
   ├─► Change event ignored (no echo)
   │
6. After 200ms delay
   ├─► includeFile(filepath) removes exclusion
```

### Example 2: External Editor Modifies File

```
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

```
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

### File Exclusion

- `FILE_EXCLUSION_CLEANUP_DELAY_MS = 200`: Time to keep file excluded after save
- Prevents echo while allowing quick re-detection of external changes

### SSE-like Debouncing (IPC Observable)

- `debounce(syncFromServer, 500)`: Batch multiple file changes
- Reduces unnecessary sync operations

### Syncer Polling

- `pollTimerInterval = 2_147_483_647`: Effectively disable polling
- All updates come via IPC Observable (event-driven, not polling)

## Why This Design Works

### 1. No Timestamp Ambiguity

- Don't try to compare `modified` fields
- File exclusion is binary: excluded or not
- No edge cases with timestamp formatting or timezone issues

### 2. Centralized Control

- Backend (watch-fs) controls both file I/O and change detection
- Can accurately exclude files it's currently saving
- Frontend just consumes change events

### 3. Simple Frontend

- No complex echo detection logic
- Trust that backend only sends real external changes
- Focus on UI and user interactions

### 4. Reliable for All Scenarios

- External editor changes: detected and synced
- Frontend saves: excluded from change detection
- Sub-wiki changes: same mechanism applies
- Multiple rapid changes: debounced and batched

## Troubleshooting

### Changes Not Appearing in Frontend

1. Check IPC Observable connection: Look for `[test-id-SSE_READY]` in logs
2. Verify watch-fs is running: Look for `[test-id-WATCH_FS_STABILIZED]`
3. Check file exclusion: Should see `[WATCH_FS_EXCLUDE]` and `[WATCH_FS_INCLUDE]`

### Echo/Duplicate Updates

1. Verify exclusion timing: 200ms should be sufficient
2. Check for multiple watchers on same path
3. Ensure frontend isn't doing its own timestamp-based filtering

### Sub-Wiki Not Syncing

1. Check sub-wiki detection: Look for `[WATCH_FS_SUBWIKI]` logs
2. Verify tiddlywiki.info has correct configuration
3. Check workspace `subWikiFolders` setting

## Future Improvements

### Potential Enhancements

1. Content-based change detection: Compare file content hash instead of just exclusion timing
2. Bidirectional conflict resolution: Handle simultaneous frontend/external edits
3. Batch file operations: Group multiple tiddler saves into single file write
4. Delta synchronization: Send only changed fields instead of full tiddler

### Not Recommended

- ❌ Timestamp-based echo detection (already tried, unreliable)
- ❌ Frontend-side file watching (duplicates backend effort)
- ❌ Polling-based synchronization (SSE is better)
