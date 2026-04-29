# Workspace Grouping

## Overview

Workspace grouping lets users organize multiple wiki workspaces into named collections in the left sidebar.

A group behaves like a lightweight container:

- it has a name
- it can be collapsed and expanded
- it can be reordered with other groups and ungrouped workspaces
- workspaces can be added to it, moved between groups, or dragged back out

This feature is designed to keep the sidebar manageable when a user has many workspaces, while still preserving direct drag-and-drop interaction.

## User-facing behavior

### Create a group by dragging

The most direct way to create a group is to drag one ungrouped workspace onto another ungrouped workspace.

When the pointer is in the center zone of the target workspace, TidGi interprets the action as a grouping action instead of a reorder action. A new group is created and both workspaces become members of that group.

### Reorder without grouping

Dragging near the top or bottom area of a workspace means reorder, not group.

- top area means place before
- bottom area means place after
- center area means group, if grouping is allowed for that pair

This is how the same drag gesture supports both list ordering and grouping without introducing separate drag handles or extra modes.

### Move workspaces into an existing group

An ungrouped workspace can be dragged onto a workspace that already belongs to a group.

If the pointer lands in the center grouping zone, the dragged workspace joins the target workspace's group.

If the pointer lands in a reorder zone, the workspace stays ungrouped and is only repositioned in the sidebar order.

### Move workspaces between groups

A workspace that already belongs to one group can be dragged onto a workspace in another group.

If the drop intent resolves to grouping, TidGi moves the dragged workspace into the target group.

### Remove a workspace from a group

Dragging a grouped workspace onto the header of its own group means ungroup.

This is an intentional shortcut. Users do not need a separate command just to pull one workspace back out into the ungrouped area.

### Reorder groups

Groups also participate in sidebar ordering.

A group header can be dragged:

- before another group
- before an ungrouped workspace

This allows the sidebar to behave as one mixed ordering space rather than as two separate lists.

### Collapse and expand groups

Each group header can be collapsed to hide its member workspaces and expanded again later.

Collapsing only changes presentation. It does not remove workspaces from the group and does not change group membership.

## Preferences-based management

In addition to drag-and-drop, groups can also be managed from Preferences.

The Preferences view provides a management section where users can:

- create a new named group
- rename an existing group
- delete a group
- assign or remove workspaces through a selection control

This path is useful when a user wants precise group management without dragging items in the sidebar.

## Interaction model

### Sidebar ordering model

TidGi treats the sidebar as an interleaved sequence of two item types:

- ungrouped workspaces
- group headers

Grouped workspaces are rendered under their group header, but the ordering logic still treats the sidebar as one ordered structure. This is why a group can be placed before another group or before an ungrouped workspace.

### Drag intent resolution

The drag system resolves intent from three things:

- what is being dragged
- what is under the pointer
- where the pointer is inside the target rectangle

For workspace-on-workspace drops, the target rectangle is divided into three zones:

- top third: reorder before
- middle third: group
- bottom third: reorder after

For group-header drags, the result is reorder only.

For workspace-on-group-header drops, the result is interpreted as either:

- join that group
- leave the current group, if the header belongs to the workspace's own group

This model keeps the visible interaction simple while still supporting several operations with one pointer gesture.

## Why the ghost preview was removed

Earlier versions used a ghost or placeholder style preview that visually moved items around while dragging. In theory this made the future drop position easier to imagine. In practice it introduced a more serious problem: the DOM and drop zones moved during the drag itself.

That movement caused two kinds of trouble.

First, intent detection became less reliable. The pointer could start over one target, the placeholder would shift the layout, and the actual drop zone under the pointer would no longer match what the user thought they were aiming at. This was especially problematic when deciding between:

- reorder before
- reorder after
- create or join a group

Second, tests and real usage could both observe unstable target geometry. Drag-and-drop logic depends on measuring current rectangles and collisions. When the list visually reorders in the middle of the gesture, those rectangles can change under the pointer and make the result harder to predict.

Because of that, TidGi now keeps DOM positions stable during the drag.

The current approach is:

- keep the canonical sidebar layout in place while dragging
- do not insert a moving ghost placeholder into the list
- show drag intent through highlighting instead

The highlight still tells the user what will happen:

- grouping intent
- ungrouping intent
- reorder before
- reorder after

This trades a more dramatic preview for a more trustworthy interaction. The result is easier to reason about, easier to test, and less likely to produce accidental grouping or accidental reordering.

## Why stable layout matters more than animated preview

The sidebar is not a plain sortable list. It mixes:

- workspaces
- group headers
- collapsed groups
- expanded groups
- workspace-to-workspace drops
- workspace-to-group-header drops
- group-header-to-group-header drops

In that environment, stable hit targets matter more than visual motion.

When users drag in a dense sidebar, they need the drop zones to stay where they are. If the UI animates a placeholder into the structure too early, the pointer can end up triggering a different action from the one the user intended.

Removing the ghost is therefore not a visual simplification for its own sake. It is a correctness decision.

## Implementation notes

At a high level, the workspace grouping UI is implemented in the main sidebar list component. The current implementation:

- keeps a canonical ordered list of workspaces and groups
- resolves drag intent from pointer position and target type
- persists reorder or membership changes after drop
- uses visual intent highlighting instead of in-drag DOM reordering

The Preferences management UI is implemented separately and uses workspace service calls to create groups, rename groups, delete groups, and synchronize membership.

## Related code

- [src/pages/Main/WorkspaceIconAndSelector/SortableWorkspaceSelectorList.tsx](../../src/pages/Main/WorkspaceIconAndSelector/SortableWorkspaceSelectorList.tsx)
- [src/windows/Preferences/customItems/WorkspaceGroupsItem.tsx](../../src/windows/Preferences/customItems/WorkspaceGroupsItem.tsx)
- [docs/internal/DragAndDrop.md](../internal/DragAndDrop.md)
