# Memeloop UI 0.2.6

`@memeloop__react-ui@0.2.6.patch` applies the renderer changes from
[upstream commit dc0314d](https://github.com/memeloop-online/memeloop/commit/dc0314d)
to the published package: remove the Source toggle and style rendered tables,
quotes, and code. Both CommonJS entries, the shared ESM chunk, and chat declarations
are patched. The old, unused toolbar portal helper remains in this distribution.

Remove this patch and its exact version pin when upgrading to a release containing
that commit. `@conversationEditing` packaged E2E covers hover tools, copy, draft
editing, both themes, and completed advanced wikitext through the selected wiki.
