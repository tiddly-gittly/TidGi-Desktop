# AI Commit Message Entry Points

This document tracks all entry points for AI-generated commit messages in TidGi.

## Core Implementation

The core AI commit message generation is implemented in `src/services/git/aiCommitMessage.ts`:

```typescript
export async function generateAICommitMessage(wikiFolderPath: string, source: string): Promise<string | undefined>
```

This function is called from `src/services/git/index.ts` in the `commitAndSync` method when no commit message is provided.

## Unified Entry Point

All entry points now use the same method: `syncService.syncWikiIfNeeded(workspace, options)`

This ensures consistent behavior including:

- Workspace validation
- User authentication checks
- Draft checking (if enabled)
- Sub-wiki handling
- Local vs remote sync logic

## Entry Points

### 1. Workspace Context Menu (Right-click menu)

File: `src/services/git/menuItems.ts`

```typescript
{
  label: t('ContextMenu.BackupNow') + t('ContextMenu.WithAI'),
  click: async () => {
    await syncService.syncWikiIfNeeded(workspace, { useAICommitMessage: true });
  },
}
```

### 2. Application Menu (知识库 > 同步 With AI)

File: `src/services/git/registerMenu.ts`

```typescript
{
  label: () => i18n.t('ContextMenu.SyncNow') + i18n.t('ContextMenu.WithAI'),
  click: async () => {
    await syncService.syncWikiIfNeeded(activeWorkspace, { useAICommitMessage: true });
  },
}
```

### 3. Git Log Window - Uncommitted Changes Panel

File: `src/windows/GitLog/CommitDetailsPanel.tsx`

```typescript
const handleCommitNowWithAI = async () => {
  await window.service.sync.syncWikiIfNeeded(workspace, { useAICommitMessage: true });
};
```

### 4. Automatic Interval Backup/Sync

File: `src/services/sync/index.ts`

```typescript
public async startIntervalSyncIfNeeded(workspace: IWorkspace): Promise<void> {
  if (syncOnInterval || backupOnInterval) {
    this.wikiSyncIntervals[id] = setInterval(async () => {
      await this.syncWikiIfNeeded(workspace);
    }, syncDebounceInterval);
  }
}
```

Note: This uses the workspace's default settings. If `aiGenerateBackupTitle` preference is enabled and no explicit commit message is set, AI generation will be triggered.

## Debugging

When the `externalAPIDebug` preference is enabled, all AI commit message generation attempts are automatically logged to the database by the `externalAPI` service.

The database stores:

- Request ID and timestamp
- Call type (streaming/immediate)
- Provider and model used
- Request payload (prompt)
- Response content
- Request/response metadata (duration, token usage, etc.)
- Error details (if any)

You can query the logs using the External API service or view them in the External API settings window.

The logging happens automatically in `externalAPIService.generateFromAI()`, so no additional logging code is needed in the AI commit message generation flow.

## Configuration

Users enable AI commit messages via:

Preferences > 知识库 > AI 生成备份标题

- Preference key: `aiGenerateBackupTitle`
- Default: `false`
- Timeout: `aiGenerateBackupTitleTimeout` (default: 5000ms)

Additionally, AI features require:

1. A configured AI provider with API token/credentials
2. A configured free model (`aiConfig.free.model` and `aiConfig.free.provider`)

The system checks these requirements using `externalAPI.isAIAvailable()` which verifies that both the model and provider are configured in the free tier settings.

Menu items with AI options (e.g., "Backup Now (AI)") are only visible when all requirements are met, checked via `gitService.isAIGenerateBackupTitleEnabled()`.

## Behavior Flow

All entry points follow the same flow:

1. Check if `aiGenerateBackupTitle` is enabled
2. Check if AI config is available
3. Get git changes (diff or untracked files)
4. Send to AI with timeout
5. On success: use AI message
6. On failure/timeout: use default message `i18n.t('LOG.CommitBackupMessage')`

This ensures consistent behavior across all entry points.
