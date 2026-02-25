# Agent Enhancement Plan — Progress Tracker

Last updated: 2026-02-26

## Summary

15-step plan to enhance TidGi Agent. All functional steps complete. Only Step 13 (unit tests for new tools) remains as future work.

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
| 7 | Approval mechanism | ✅ | Persistence via localStorage |
| 8 | Wikitext rendering + MessageRenderer | ✅ | — |
| 9 | Streaming performance | ✅ | — |
| 10 | New tools (12+) | ✅ | All exist and registered, alarmClock now in default config |
| 11 | Sub-agent support | ✅ | — |
| 12 | God class splitting | ✅ | index.ts: 972→663, defineTool.ts: 820→596 |
| 13 | Code quality / tests | 🔶 | Zero tests for 15+ new tool files (future work) |
| 14 | Approval UI settings | ✅ | Persistence via localStorage |
| 15 | Documentation | ✅ | Stale links fixed |

## Extracted Files (Step 12)

### From `agentInstance/index.ts` (972→663 lines):
- `agentRepository.ts` (166 lines) — CRUD: createAgent, getAgent, updateAgent, deleteAgent, getAgents
- `agentMessagePersistence.ts` (150 lines) — saveUserMessage, createDebouncedMessageUpdater

### From `tools/defineTool.ts` (820→596 lines):
- `defineToolTypes.ts` (234 lines) — All type/interface definitions
- `toolRegistry.ts` (47 lines) — registerToolDefinition, getAllToolDefinitions, getToolDefinition

## Future Work (Step 13)

New tool files without unit tests:
- summary, alarmClock, askQuestion, backlinks, toc, recent, listTiddlers
- getErrors, zxScript, webFetch, spawnAgent, editTiddler, todo
- approval, parallelExecution, tokenEstimator, retryUtility
- matchAllToolCallings (in responsePatternUtility)
