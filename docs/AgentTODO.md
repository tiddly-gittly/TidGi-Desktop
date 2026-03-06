# Agent Enhancement — Session 2026-03-05/06

## Current Plan (Source of Truth)

### Goals

1. Unified **ScheduledTask** system replacing fragmented heartbeat/alarm.
2. Keep agent background scheduling useful but explicit to users.
3. Prevent sub-agent scheduling side effects.
4. Make scheduling observable and editable from UI.
5. Keep tests strict: treat interruption/timeout as real failures and fix root causes.

### Architecture Decisions

1. Closing a chat tab does **not** stop the agent process; tab is a view, agent is runtime state.
2. Sub-agents are `volatile` and should not restore background scheduling after restart.
3. **ScheduledTask is an independent DB entity** (not embedded in AgentDefinition/AgentInstance) — enables unified UI, multiple concurrent tasks, and cross-agent queries (needed for Tab indicator).
4. **croner** library for cron parsing — lightweight (10 KB), no extra deps, IANA timezone support.
5. UI shows schedule signal where users actually operate tabs (header tab dropdown path).
6. Timer lifecycle must not block process exit (`unref` for long-running timers).
7. Tab close does **not** stop background agent tasks — tooltip correctly says "will continue running in background".

## Completed Work

### Phase 1: Bug Fixes

1. Added shared `AgentBackgroundTask` contract in `agentInstance/interface.ts`.
2. Added `nextWakeAtISO` exposure for heartbeat and alarm tasks.
3. Fixed sub-agent behavior:
   - `spawnAgent` now creates child with `{ volatile: true }`.
   - `sendMsgToAgent` no longer auto-starts heartbeat for volatile instances.
4. Fixed cleanup behavior:
   - `closeAgent` / `deleteAgent` now clear alarm + heartbeat + ScheduledTaskManager tasks.
5. Timer robustness:
   - `heartbeatManager` interval is `unref`-ed.
   - `alarmClock` timeout/interval timers are `unref`-ed.
6. Task Agent template changed so `alarmClock` default approval mode is `auto`.
7. Added settings API for alarm upsert: `setBackgroundAlarm(agentId, ...)`.
8. Added settings API for heartbeat upsert: `setBackgroundHeartbeat(agentId, ...)`.
9. Added task metadata tracking for runtime observability:
   - `createdBy`
   - `lastRunAtISO`
   - `runCount`
10. Fixed `getAgents` query filters to use real persisted fields (`volatile`).

### Phase 2: Unified ScheduledTask System

1. **`croner` library installed** via pnpm.
2. **`ScheduledTaskEntity`** added to `src/services/database/schema/agent.ts`:
   - `id`, `agentInstanceId`, `agentDefinitionId`, `name`
   - `scheduleKind: 'interval' | 'at' | 'cron'`
   - `schedule: ScheduleConfig` (union of `IntervalSchedule | AtSchedule | CronSchedule`)
   - `payload`, `enabled`, `deleteAfterRun`
   - `activeHoursStart/End`, `lastRunAt`, `nextRunAt`, `runCount`, `maxRuns`, `createdBy`
   - Registered in `DatabaseService` entity list.
3. **`ScheduledTaskManager`** (`scheduledTaskManager.ts`):
   - `initScheduledTaskManager(repo, agentInstanceService)` — boot hook
   - `addTask / updateTask / removeTask` — CRUD with DB persistence
   - `restoreScheduledTasks(repo, isVolatile)` — re-creates timers on app start, skipping volatile agents
   - `getActiveTasks / getActiveTasksForAgent` — query active in-memory registry
   - `cancelTasksForAgent(agentInstanceId)` — used by `closeAgent` / `deleteAgent`
   - `getCronPreviewDates(expr, tz, n)` — returns next N run datetimes (for UI preview)
   - `stopAllScheduledTasks()` — for app shutdown
   - Uses `croner.Cron` for cron-kind tasks; `setInterval/setTimeout` + `.unref()` for others
4. **`IAgentInstanceService`** extended with:
   - `createScheduledTask / updateScheduledTask / deleteScheduledTask`
   - `listScheduledTasks / listScheduledTasksForAgent`
   - `getCronPreviewDates`
   - `CreateScheduledTaskInput`, `UpdateScheduledTaskInput`, `ScheduledTask` types re-exported from manager
5. **`AgentInstanceService`** wired:
   - `initializeDatabase()` initialises ScheduledTaskManager
   - `initialize()` calls `restoreScheduledTaskManagerTasks()` on startup
   - `deleteAgent/closeAgent` call `cancelTasksForAgent`
   - 6 new public methods delegating to ScheduledTaskManager

### Phase 3: EditAgentDefinition Schedule UI

1. **`EditAgentDefinitionContent.tsx`** — added "Scheduled Wake-up" section:
   - Mode dropdown: None / Interval / Daily / Advanced cron
   - Interval: number + unit (s/min/h)
   - Daily: time picker + timezone field
   - Cron: expression field + timezone + live "next 3 runs" preview (calls `getCronPreviewDates`)
   - Wake-up message textarea
   - Active hours start/end
   - Save/Update button (disabled until preview agent loads)
   - Loads existing task via `listScheduledTasksForAgent` when preview agent is created

### Phase 4: Tab Icon & Close Warning

1. **Schedule indicator + close warning text** in tab UIs.
2. Implemented on real active path: `TabListDropdown` (header tab menu).
3. `TabItem` shows clock icon with next-run tooltip.
4. Close button tooltip warns "will continue running in background".

### Phase 5: Preferences Background Tasks Upgrade

1. **AIAgent.tsx** — new "Scheduled Tasks" section with **MUI Table**:
   - Columns: Name, Agent, Type, Schedule, Next Run, Runs, Enabled (Switch), Actions (Edit/Delete)
   - Empty state with description text + quick create entry
   - "Add Task" button → ScheduledTask create/edit dialog (supports interval + cron, cron preview)
   - Enable/disable via Switch without deleting
   - Refresh button
2. Legacy "Background Tasks" section (Chip list, alarm/heartbeat dialogs) preserved for backward compatibility.
3. `ScheduledTaskFormDialog` inline state in AIAgent.tsx; shared pattern with EditAgentDef section.

### Phase 6: Agent Tool Upgrades

1. **`alarmClock.ts` upgraded** — added sub-tools alongside legacy `alarm-clock`:
   - `schedule-task` — create ScheduledTask (interval/at/cron) via `addTask()`
   - `list-schedules` — list active tasks for this agent via `getActiveTasksForAgent()`
   - `remove-schedule` — remove by task ID via `removeTask()`
   - `update-schedule` — enable/disable/change message via `updateTask()`
2. **`editAgentDefinition.ts`** — new tool registered in `tools/index.ts`:
   - `edit-heartbeat` — modify heartbeat config via `setBackgroundHeartbeat()`
   - `edit-agent-prompt-config` — modify agentFrameworkConfig field via `updateAgentDef()`

### Phase 7: Tests

1. **Unit tests** `scheduledTaskManager.test.ts` (12 tests, all green):
   - initScheduledTaskManager, addTask, removeTask, updateTask
   - cancelTasksForAgent
   - restoreScheduledTasks (non-volatile restored, volatile skipped)
   - Active hours filtering (fires when no restriction; skips outside narrow window)
   - getCronPreviewDates (valid + invalid expression)
2. **Legacy unit tests** preserved: `backgroundTaskSettings.test.ts`, `agentRepository.test.ts`, etc. — all 27 pass.
3. **E2E feature**: `scheduledTask.feature` — 5 scenarios covering:
   - View / open / cancel scheduled task dialog in preferences
   - Create interval task in preferences
   - Cron mode shows expression + timezone fields
   - EditAgentDef schedule section renders
   - Tab clock indicator scenario (manual verify)

## Remaining TODO (Future Enhancements)

1. **Data migration**: auto-migrate `AgentDefinition.heartbeat` → `ScheduledTaskEntity` on first run; deprecate old heartbeat field.
2. **DST-aware daily scheduling**: current cron mode handles DST via IANA timezone; daily mode in EditAgentDef uses cron expression under the hood.
3. **Historical task analytics**: persist run history beyond `runCount` / `lastRunAt`.
4. **Sub-agent volatile warning**: log warning when a volatile sub-agent calls `schedule-task` (task will not survive restart).
5. **Expand E2E**: step definitions for `select {value} from {element}` may need to be added to cover the new cron mode scenario fully.
6. **`AgentBrowserTabEntity` missing from DB import** — verify it is still registered (unchanged from before this PR).

## Risks / Notes

1. Very large future `wakeAtISO` can overflow `setTimeout` in JS runtime; tests use realistic timestamps.
2. LSP may show "error typed value" for `ScheduledTaskEntity` members — this is a cold-start TypeORM decorator resolution issue; `tsc --noEmit` reports no errors.
3. The `alarmClock` legacy system and new `ScheduledTaskManager` coexist; both persist to DB but in different tables. Full migration of legacy alarms is a future task.


### Goals

1. Keep agent background scheduling useful but explicit to users.
2. Prevent sub-agent scheduling side effects.
3. Make scheduling observable and editable from UI.
4. Keep tests strict: treat interruption/timeout as real failures and fix root causes.

### Architecture Decisions

1. Closing a chat tab does **not** stop the agent process; tab is a view, agent is runtime state.
2. Sub-agents are `volatile` and should not restore background scheduling after restart.
3. Heartbeat/Alarm tasks are listed centrally by `getBackgroundTasks()`.
4. UI shows schedule signal where users actually operate tabs (header tab dropdown path).
5. Timer lifecycle must not block process exit (`unref` for long-running timers).

## Completed Work

### Backend

1. Added shared `AgentBackgroundTask` contract in `agentInstance/interface.ts`.
2. Added `nextWakeAtISO` exposure for heartbeat and alarm tasks.
3. Fixed sub-agent behavior:
   - `spawnAgent` now creates child with `{ volatile: true }`.
   - `sendMsgToAgent` no longer auto-starts heartbeat for volatile instances.
4. Fixed cleanup behavior:
   - `closeAgent` / `deleteAgent` now both clear alarm + heartbeat.
5. Timer robustness:
   - `heartbeatManager` interval is `unref`-ed.
   - `alarmClock` timeout/interval timers are `unref`-ed.
6. Task Agent template changed so `alarmClock` default approval mode is `auto`.
7. Added settings API for alarm upsert: `setBackgroundAlarm(agentId, ...)`.
8. Added settings API for heartbeat upsert: `setBackgroundHeartbeat(agentId, ...)`.
9. Added task metadata tracking for runtime observability:
   - `createdBy`
   - `lastRunAtISO`
   - `runCount`
10. Fixed `getAgents` query filters to use real persisted fields (`volatile`).

### UI

1. Added schedule indicator + close warning text in tab UIs.
2. Implemented on real active path: `TabListDropdown` (header tab menu).
3. Preferences `AIAgent` section consumes shared background task type.
4. Preferences supports alarm creation/editing (countdown/daily/interval).
5. Preferences supports heartbeat creation/editing (enable/disable, interval, active-hours window).
6. Task list now shows richer metadata (creator / last run / run count).

### Tests

1. Added unit test: `agentRepository.test.ts` for volatile creation path.
2. Fixed previously interrupted streaming test by timer lifecycle fix.
3. Added and validated e2e scenario for scheduled indicator + close warning.
4. Added focused unit tests for background settings APIs:
   - alarm upsert
   - heartbeat upsert
   - startup restoration behavior
5. Added e2e scenarios for preferences-based scheduling workflows:
   - create countdown alarm
   - edit + cancel alarm
   - create + disable heartbeat

## Remaining TODO (Next Steps)

### Phase 2 — Unified Scheduling System (croner)

1. Install `croner` library as cron expression parser (same choice as OpenClaw; lightweight, IANA tz aware).
2. Add `ScheduledTaskEntity` to `src/services/database/schema/agent.ts`:
   - Fields: `id`, `agentInstanceId` (FK), `agentDefinitionId` (FK optional), `name`, `scheduleKind` (`interval|at|cron`), `schedule` (JSON), `payload` (JSON `{message}`), `enabled`, `deleteAfterRun`, `activeHoursStart`, `activeHoursEnd`, `lastRunAt`, `nextRunAt`, `runCount`, `maxRuns`, `createdBy`, `created`, `updated`.
3. Create `src/services/agentInstance/scheduledTaskManager.ts` — unified manager using croner for cron tasks, setTimeout/setInterval for others. API: `addTask / updateTask / removeTask / restoreTasks / getActiveTasks / getActiveTasksForAgent`.
4. Expose CRUD via IPC: `createScheduledTask / updateScheduledTask / deleteScheduledTask / listScheduledTasks / listScheduledTasksForAgent` on `IAgentInstanceService`.
5. Migrate existing data on `initialize()`: `AgentDefinition.heartbeat` → `ScheduledTaskEntity`; `AgentInstanceEntity.scheduledAlarm` → `ScheduledTaskEntity`.

### Phase 3 — Agent Definition Edit UI: Schedule Section

6. Add "Scheduled Wake-up" `SectionContainer` to `EditAgentDefinitionContent.tsx`:
   - Mode select: none / interval / daily / cron.
   - Interval: number input + unit select (s/min/h).
   - Daily: TimePicker + active-hours range.
   - Cron: text input + timezone select + live preview (next 3 triggers via croner).
   - Message textarea.
   - On save: call `createScheduledTask` / `updateScheduledTask`.

### Phase 5 — Preferences Background Tasks Panel Upgrade

7. Redesign `AIAgent.tsx` Background Tasks area:
   - Replace Chip list with MUI `Table` (sortable columns: Name, Agent, Type, Schedule, Next Run, Last Run, Runs, Enabled toggle, Actions).
   - Shared `ScheduledTaskFormDialog` component reused between preferences and EditAgentDef.
   - Improved empty state: explain purpose + quick-create CTA.

### Phase 6 — Tool Upgrades

8. Upgrade `alarmClock.ts` → add sub-tools: `schedule-task` (cron support), `list-schedules`, `remove-schedule`, `update-schedule`. Keep old schema as alias.
9. Add `editAgentDefinition` tool (`src/services/agentInstance/tools/editAgentDefinition.ts`): lets agent modify its own AgentDefinition (heartbeat, tools, prompt). Approval mode: `confirm`. Syncs heartbeat changes to `ScheduledTaskEntity`.

### Phase 7 — Tests

10. Unit tests for `ScheduledTaskManager`: cron parsing, timezone handling, restore logic, active hours, volatile exemption, expiry.
11. E2E: new `scheduledTask.feature` covering table CRUD in preferences, agent-def schedule config, tab clock icon, close warning.
12. Manual: restart app → tasks restored; spawnAgent → no inherited schedule; tab close warning interaction.

## Decisions

- Tab close does **not** stop agent (keep current behavior).
- Sub-agents are `volatile: true` — exempt from schedule restore.
- `ScheduledTaskEntity` is independent (not embedded) for unified UI query and concurrent tasks.
- `croner` library chosen: 10 KB, no extra deps, IANA timezone, same as OpenClaw.
- Close-tab tooltip says "Agent continues running in background" (accurate behavior description).

## Risks / Notes

1. Very large future `wakeAtISO` can overflow `setTimeout` in JS runtime; tests should use realistic timestamps.
2. Daily mode implemented as repeating interval may drift around DST boundaries; cron-mode solves this.
3. Current UX now warns explicitly: closing tab does not stop background wake-ups.

## Risks / Notes

1. Very large future `wakeAtISO` can overflow `setTimeout` in JS runtime; tests should use realistic timestamps.
2. Daily mode implemented as repeating interval may drift around DST boundaries; cron-mode can solve this later.
3. Current UX now warns explicitly: closing tab does not stop background wake-ups.
