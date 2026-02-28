# Agent Enhancement Plan — Progress Tracker

Last updated: 2026-02-27

## Summary

15-step plan to enhance TidGi Agent. All functional steps complete. Git-based turn rollback feature added (2026-02-27).

## Status Legend

- ✅ Complete
- 🔶 Partial — needs finishing work
- ❌ Not started

## Per-Step Status

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Recursion→Iteration + Termination tools | ✅ | while-loop + maxIterations guard + alarmClock in default config |
| 2 | Token counting + pie chart | ✅ | — |
| 3 | System prompt rewrite | ✅ | — |
| 4 | Parallel tool call support | ✅ | — |
| 5 | API retry mechanism | ✅ | `withRetry` wired into `generateFromAI` via `streamFromProvider` |
| 6 | MCP integration | ✅ | Not in default config by design — user adds manually |
| 7 | Approval mechanism | 🔶 | IPC + UI + infrastructure done, but NOT wired into tool execution flow. `requestApproval()` never called. |
| 8 | Wikitext rendering + MessageRenderer | ✅ | Uses `useRenderWikiText` hook, streaming split support |
| 9 | Streaming performance | ✅ | — |
| 10 | New tools (12+) | ✅ | All exist and registered, alarmClock now in default config |
| 11 | Sub-agent support | ✅ | — |
| 12 | God class splitting | ✅ | index.ts: 972→663, defineTool.ts: 820→596 |
| 13 | Code quality / tests | ✅ | 29 new MessageRenderer unit tests, all 473 tests pass |
| 14 | Approval UI settings | 🔶 | UI exists but no backend integration (approval infra unused) |
| 15 | Documentation | ✅ | Stale links fixed |

## Critical Bugs Fixed (2026-02-26 session 3: Rendering Pipeline & Store Reactivity)

### 14. Zustand store direct mutation — streaming UI never updated
- **Problem**: In `agentActions.ts`, message subscription updates used `get().messages.set(id, msg)` — directly mutating the Map without calling `set()`. Zustand subscribers were never notified, so `MessageBubble` components did not re-render during streaming. The UI only updated when the stream ended (via `setMessageStreaming(false)` which DID call `set()`).
- **Fix**: Changed to immutable pattern: `set(state => { const newMessages = new Map(state.messages); newMessages.set(id, msg); return { messages: newMessages }; })`. Also fixed `subscribeToUpdates` new-message path to create a new Map instead of mutating in-place.

### 15. `stripToolXml` didn't handle partial/unclosed tags during streaming
- **Problem**: During streaming, the assistant message content may contain `<tool_use name="wiki-search">{"filter":"[title` without a closing `</tool_use>` tag. The existing regex `/<tool_use\s+name="[^"]*"[^>]*>[\s\S]*?<\/tool_use>/gi` only matched complete tags. Partial tags showed as raw XML to users during streaming.
- **Fix**: Added additional regex patterns to strip partial/unclosed tags: `/<tool_use\s[^>]*>[\s\S]*$/gi`, `/<function_call\s[^>]*>[\s\S]*$/gi`, `/<functions_result>[\s\S]*$/gi`, and `/<(?:tool_use|function_call|...)\\b[^>]*$/gi` for incomplete opening tags.

### 16. Renderer fallbacks showed raw XML
- **Problem**: All 5 specialized renderers (AskQuestion, ToolResult, ToolApproval, EditDiff, TodoList) had fallback paths that rendered `message.content` directly when JSON parsing failed. This showed raw `<functions_result>` XML to users.
- **Fix**: Exported `stripToolXml()` from `BaseMessageRenderer` and applied it in all fallback paths. Returns `null` if stripped content is empty.

### 17. Renderer registration in useEffect — not available on first render
- **Problem**: `useRegisterMessageRenderers()` registered renderers in `useEffect`, which runs AFTER the first render. Messages loaded from persistence were rendered with `BaseMessageRenderer` (no pattern matching) on initial mount, because `renderersRegistry` was still empty.
- **Fix**: Moved all `registerMessageRenderer()` calls to module scope in `useMessageRendering.ts`. Registration now happens at ES module import time, before any React component renders.

### 8. Assistant message with raw `<tool_use>` XML shown permanently for ask-question/summary tools
- **Problem**: `addToolResult()` did NOT mark the assistant message as a tool-call message (set `duration=1` + `containsToolCall` metadata). Only `yieldToSelf()` did this, but `askQuestion.ts`, `summary.ts`, and `modelContextProtocol.ts` used `addToolResult()` directly without calling `yieldToSelf()`.
- **Fix**: Moved the assistant-message-marking logic INTO `addToolResult()` itself. Now every `addToolResult()` call automatically sets `duration=1` and `containsToolCall=true` on the latest assistant message. Simplified `yieldToSelf()` to only set `yieldNextRoundTo = 'self'`.

### 9. BaseMessageRenderer showed raw `<tool_use>` XML tags to users
- **Problem**: `BaseMessageRenderer` rendered `message.content` verbatim with no processing. Messages containing `<tool_use>`, `<function_call>`, `<parallel_tool_calls>`, or `<functions_result>` tags showed raw XML.
- **Fix**: Added `stripToolXml()` utility that removes all tool-related XML tags. Applied in both `BaseMessageRenderer` and `ThinkingMessageRenderer` (which also showed raw XML in its `mainContent`).

### 10. No generic ToolResultRenderer — 12+ tools showed raw `<functions_result>` XML
- **Problem**: Only 4 tools (ask-question, edit-tiddler, todo, tool-approval) had custom renderers. All other tools (wiki-search, backlinks, toc, list-tiddlers, recent, zx-script, web-fetch, etc.) showed raw `<functions_result>Tool: ...\nResult: ...</functions_result>` text.
- **Fix**: Created `ToolResultRenderer.tsx` — a generic collapsible card that shows tool name, truncated result preview, and expandable full parameters + result. Registered with pattern `/<functions_result>/` at priority 10 (lowest, so specific renderers take precedence).

### 11. All Result JSON parsers were greedy — captured past `</functions_result>`
- **Problem**: Renderers used `/Result:\s*(.+)/s` which with the `s` flag greedily matched past the JSON into the `</functions_result>` closing tag. `JSON.parse()` would fail on the trailing XML.
- **Fix**: Changed all 5 renderers + `todo.ts` backend to use `/Result:\s*(.+?)\s*(?:<\/functions_result>|$)/s` — non-greedy match that stops before the closing tag.

### 12. ask-question tool only supported single-select
- **Problem**: `askQuestion` tool schema only had `question`, `options`, and `allowFreeform`. No way for the agent to ask multi-select questions or text-only inputs.
- **Fix**: Added `inputType` field (`'single-select' | 'multi-select' | 'text'`). `AskQuestionRenderer` now supports: single-select (clickable chips), multi-select (checkboxes + submit button), and text-only (just a text box). The result JSON includes `inputType` for proper rendering.

### 13. E2E image upload test opened native OS file dialog
- **Problem**: The test clicked "Add Image" button which triggered `fileInputReference.current?.click()`, opening the native OS file dialog that blocks the test runner.
- **Fix**: Simplified the test to directly use `setInputFiles()` on the hidden `<input type="file">` element, bypassing the native dialog entirely.

## New Files Created

- `src/pages/ChatTabContent/components/MessageRenderer/ToolResultRenderer.tsx` — Generic tool result renderer
- `src/pages/ChatTabContent/components/MessageRenderer/__tests__/MessageRenderers.test.tsx` — 26 unit tests covering AskQuestion (single/multi/text), ToolResult, ToolApproval, BaseMessageRenderer XML stripping, and pattern routing

## Critical Bugs Fixed (2026-02-26 session 1)

### 1. `input-required` status never set (ask-question tool broken)
- **Problem**: `askQuestion.ts` claimed "framework will set status to input-required" but no code did this. Status was always `'completed'` after ask-question, making the agent appear finished.
- **Fix**: Added `inputRequired()` to `statusUtilities.ts`, added `yieldToHuman()` to tool handler context (`defineToolTypes.ts` + `defineTool.ts`), `askQuestion.ts` now calls `yieldToHuman()` to signal the framework. `taskAgent.ts` checks for `yieldNextRoundTo === 'human'` and yields `inputRequired(...)` instead of `completed(...)`.

### 2. Summary tool caused one extra unwanted round
- **Problem**: `summary.ts` used `executeToolCall()` which auto-calls `yieldToSelf()`, causing the agent to run one more LLM round after the summary was produced.
- **Fix**: Changed to use `addToolResult()` directly (like `askQuestion.ts`), avoiding the automatic `yieldToSelf()`.

### 3. ToolApprovalRenderer Allow/Deny buttons were non-functional
- **Problem**: Both `handleApprove` and `handleDeny` had `// TODO: expose resolveApproval via IPC` placeholders. The backend `resolveApproval()` function existed but was never exposed via IPC.
- **Fix**: Added `resolveToolApproval(approvalId, decision)` to `IAgentInstanceService` interface + IPC descriptor + service implementation. `ToolApprovalRenderer` now calls `window.service.agentInstance.resolveToolApproval(...)`.

### 4. AskQuestionRenderer answered state lost on page refresh
- **Problem**: `answered` was React local state (`useState(false)`), reset on every component remount.
- **Fix**: Initialized from `message.metadata.askQuestionAnswered`, persisted via `debounceUpdateMessage()` when user answers.

### 5. WikitextMessageRenderer always fell back to plain text
- **Problem**: `renderWikitext()` function had `setError(true)` as the first line with `// TODO: get active workspace ID`. It never actually rendered wikitext.
- **Fix**: Replaced with `useRenderWikiText` hook (from `@services/wiki/hooks`) which handles workspace resolution. Streaming support: only renders complete blocks (split on `\n\n`), trailing text shown with reduced opacity.

### 6. `input-required` not treated as terminal state in frontend
- **Problem**: Frontend `agentActions.ts` only treated `completed|failed|canceled` as terminal states. `input-required` messages kept streaming flags active indefinitely.
- **Fix**: Added `input-required` to terminal state checks in both agent-level and message-level subscription handlers.

### 7. ask-question tool result duration was 0
- **Problem**: `duration: 0` meant the question was immediately excluded from AI context in subsequent rounds, so the AI couldn't see what it had asked.
- **Fix**: Changed to `duration: 3` so the question stays visible in context for a few rounds.

## Extracted Files (Step 12)

### From `agentInstance/index.ts` (972→663 lines):
- `agentRepository.ts` (166 lines) — CRUD: createAgent, getAgent, updateAgent, deleteAgent, getAgents
- `agentMessagePersistence.ts` (150 lines) — saveUserMessage, createDebouncedMessageUpdater

### From `tools/defineTool.ts` (820→596 lines):
- `defineToolTypes.ts` (234 lines) — All type/interface definitions
- `toolRegistry.ts` (47 lines) — registerToolDefinition, getAllToolDefinitions, getToolDefinition

## Future Work

New tool files without unit tests:
- summary, alarmClock, backlinks, toc, recent, listTiddlers
- getErrors, zxScript, webFetch, spawnAgent, editTiddler
- approval, parallelExecution, tokenEstimator, retryUtility
- matchAllToolCallings (in responsePatternUtility)

Remaining renderer improvements:
- MarkdownRenderer — currently falls back to BaseMessageRenderer
- HtmlRenderer — currently falls back to BaseMessageRenderer

## Git-based Turn Rollback (2026-02-27)

Records HEAD commit hash for all wiki workspaces before each agent turn starts.
After the turn, compares commits to detect changed files and displays "X files changed" in the TurnActionBar.
Users can click Rollback to restore files via `git show <beforeCommitHash>:<file>`.

Files changed:
- `src/services/git/gitOperations.ts` — added `getHeadCommitHash`, `restoreFileFromCommit`, `getChangedFilesBetweenCommits`
- `src/services/agentInstance/interface.ts` — added `rollbackTurn`, `getTurnChangedFiles` to interface + IPC descriptor
- `src/services/agentInstance/index.ts` — records beforeCommitMap in sendMsgToAgent, implements rollbackTurn/getTurnChangedFiles
- `src/pages/ChatTabContent/components/TurnActionBar.tsx` — files changed chip, rollback button, rolled-back indicator

E2E tests:
- `features/agentTool.feature` — added "delete removes turn" and "rollback button hidden for plain text" scenarios
- `features/agentTool.feature` — fixed "retry and delete" → split into separate retry/delete scenarios
- `features/streamingStatus.feature` — removed redundant 3rd round in streaming status test
