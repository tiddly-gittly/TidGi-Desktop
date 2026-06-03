# Analytics in TidGi Desktop

This document explains how analytics works in TidGi Desktop, what is intentionally tracked, what is intentionally blocked, and how plugin authors should integrate with the analytics service.

## Goals

TidGi uses analytics to understand coarse product usage without collecting user content.

The current design goals are:

- Keep all network delivery in the Electron main process
- Never expose the analytics API key to renderer or plugin code
- Track only coarse, product-level behavior
- Reject free-form content, note text, file paths, URLs, tokens, and other sensitive payloads
- Give plugin authors a stable way to emit custom product events without bypassing privacy guardrails

## Architecture

1. Renderer code and TiddlyWiki plugins call the TidGi analytics service through the existing IPC proxy layer
2. The analytics service runs in the main process
3. The main process sends events to Rybbit over HTTP

## Delivery model

- Analytics is enabled only when all of the following are true:
  - `analyticsEnabled` preference is `true`
  - `analyticsHost` is configured
  - `analyticsSiteId` is configured
  - a main-process-only analytics API key is configured
- Unsent events may be queued temporarily in memory
- The queue is dropped immediately when the user disables analytics
- The first-run disclosure is tracked separately from normal product events

## Privacy constraints

TidGi analytics must never contain:

- note titles or note bodies
- workspace names
- filesystem paths
- raw URLs
- access tokens, OAuth codes, cookies, or API keys
- free-form user text copied from the UI

If a proposed event depends on any of the above, do not add it to analytics.

## Built-in events

The application currently emits built-in events such as:

- `app.launched`
- `analytics.disclosure_dismissed`
- `workspace.created`
- `workspace.activated`
- `preferences.analytics_updated`
- `settings.opened`
- `theme.changed`
- `deep_link.opened`
- `sync.triggered`
- `sync.completed`
- `sync.failed`
- `updater.check_started`
- `updater.update_available`
- `updater.update_not_available`
- `updater.check_failed`
- `error.report_requested`

Built-in events use an allowlist. For each built-in event, only explicitly approved property keys are retained.

That allowlist lives in `src/services/analytics/index.ts`.

## Plugin-defined custom events

Plugin authors must not emit arbitrary event names through the low-level built-in event contract.

Instead, plugins should call:

```ts
await window.service.analytics.trackPluginEvent(pluginId, eventName, properties);
```

or inside a TiddlyWiki plugin:

```ts
await $tw.tidgi.service.analytics.trackPluginEvent(pluginId, eventName, properties);
```

### Final event name format

The service converts plugin calls into this final event name:

```text
plugin.<pluginId>.<eventName>
```

Example:

```ts
await window.service.analytics.trackPluginEvent('kanban-board', 'card_created', {
  source: 'toolbar',
  has_due_date: true,
});
```

Emits:

```text
plugin.kanban-board.card_created
```

### Validation rules

Plugin event names are intentionally restricted.

- `pluginId` must match: `^[a-z0-9]+(?:[-_][a-z0-9]+)*$`
- `eventName` must match: `^[a-z0-9]+(?:[-_][a-z0-9]+)*$`
- Property keys must match: `^[a-z][a-z0-9_]{0,39}$`
- Property values must be `string | number | boolean`
- String values are truncated to 120 characters

If `pluginId` or `eventName` is invalid, the event is rejected.

If all properties are invalid, the event is still allowed to be sent without properties.
