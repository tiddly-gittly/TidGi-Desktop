# Agent Enhancement — Session 2026-03-05

## Changes Made

### 1. Agent Switcher moved to header with AutoComplete search

- Moved `AgentSwitcher` from `InputContainer` (bottom left) to `ChatHeader` (top bar, next to title)
- Dropdown now opens **downward** instead of upward
- Added MUI `Autocomplete` with inline search box — filters agents by name and description
- Cleaned up unused props from `InputContainer` and `ChatTabContent`

### 2. Tool Approval wired into execution flow

- `evaluateApproval()` + `requestApproval()` now called before every `executeToolCall()` in `defineTool.ts`
- Also integrated into `executeAllMatchingToolCalls()` for batch approval
- Denied tools return an error tool result and yield back to the agent
- Pending tools block execution until the user responds via `resolveApproval()`

### 3. Context window token truncation

- Added `contextWindowSize` optional field to `FullReplacementParameterSchema`
- After `filterMessagesByDuration()`, messages are now trimmed by token count
- Oldest messages are removed first; 70% of context budget allocated to history
- Default set to 120,000 tokens in both Task Agent and Plan Agent configs

### 4. Heartbeat auto-wake configuration

- New `AgentHeartbeatConfig` interface on `AgentDefinition` (enabled, intervalSeconds, message, activeHoursStart/End)
- `heartbeatManager.ts` manages per-agent `setInterval` timers
- Heartbeats started after successful framework run, stopped on close/cancel/delete
- Active hours filtering supports overnight ranges (e.g. 22:00-06:00)
- Persisted via `heartbeat` column on `AgentDefinitionEntity`

### 5. Alarm clock recurring support

- `alarm-clock` tool now accepts optional `repeatIntervalMinutes` parameter
- First fire happens at the specified `wakeAtISO`, then repeats at the interval
- `cancelAlarm()` clears both `setTimeout` and `setInterval` timers

### 6. Tool result smart truncation

- `addToolResult()` now truncates results exceeding 32,000 characters
- Truncated results include a `[... truncated]` marker with original length
- Prevents a single wiki-search result from consuming the entire context window

### 7. Step definition fix for embedding-only mock rules

- `agent.ts` step definition now accepts mock rules with only `embedding` (no `response`)
- Previously `if (response) rules.push(...)` would skip embedding-only rules

## Files Changed

- `src/pages/ChatTabContent/components/AgentSwitcher.tsx` — Rewritten with Autocomplete
- `src/pages/ChatTabContent/components/ChatHeader.tsx` — Now hosts AgentSwitcher
- `src/pages/ChatTabContent/components/InputContainer.tsx` — Removed AgentSwitcher
- `src/pages/ChatTabContent/index.tsx` — Props routing updated
- `src/services/agentDefinition/interface.ts` — Added AgentHeartbeatConfig
- `src/services/agentDefinition/index.ts` — Heartbeat in CRUD and initialization
- `src/services/agentInstance/heartbeatManager.ts` — New file
- `src/services/agentInstance/index.ts` — Heartbeat lifecycle integration
- `src/services/agentInstance/tools/defineTool.ts` — Approval + truncation wiring
- `src/services/agentInstance/tools/alarmClock.ts` — Recurring alarm support
- `src/services/agentInstance/promptConcat/modifiers/fullReplacement.ts` — Token trimming
- `src/services/agentInstance/agentFrameworks/taskAgents.json` — contextWindowSize defaults
- `src/services/database/schema/agent.ts` — Heartbeat column
- `features/stepDefinitions/agent.ts` — Embedding rule fix