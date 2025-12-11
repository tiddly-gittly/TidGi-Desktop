# Drag-and-Drop Optimistic Update (TidGi)

## Implementation Summary

TidGi uses **optimistic UI updates** for drag-and-drop reordering in both form arrays and sidebar workspace lists. This ensures a smooth user experience without flicker or delay, even when backend or form updates are slow.

### Key Points

- When a drag ends, the UI immediately updates the order using local state (store or useState), before waiting for backend or form data to update.
- The backend update (or form update) is triggered asynchronously. When the new data arrives, the local optimistic state is cleared.
- This prevents the UI from briefly reverting to the old order before the update is confirmed.

### Implementation Details

- **Form Arrays**: Uses zustand store (`itemsOrder`) for optimistic rendering. See `ArrayFieldTemplate.tsx` and `arrayFieldStore.ts`.
- **Sidebar Workspaces**: Uses local React state (`optimisticOrder`) for workspace ID order. See `SortableWorkspaceSelectorList.tsx`.

### Cautions

- Always clear the optimistic state when the real data arrives, to avoid stale UI.
- Do not mutate the original data objects; always clone or use new arrays/objects.
- If backend update fails, consider showing an error or reverting the optimistic state.

### References

- [ArrayFieldTemplate.tsx](../../src/pages/ChatTabContent/components/PromptPreviewDialog/PromptConfigForm/templates/ArrayFieldTemplate.tsx)
- [arrayFieldStore.ts](../../src/pages/ChatTabContent/components/PromptPreviewDialog/PromptConfigForm/store/arrayFieldStore.ts)
- [SortableWorkspaceSelectorList.tsx](../../src/pages/Main/WorkspaceIconAndSelector/SortableWorkspaceSelectorList.tsx)
