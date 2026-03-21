# Menu System Overview

This document describes the menu registration and context menu system in TidGi-Desktop, including how right-click context menus and application menus are registered, how they are shared or separated, and the main extension points for workspace-related actions.

## Menu Registration Entry Points

### Application Menubar (Main Process)

- Registered via `src/services/menu/index.ts` using the `MenuService` class.
- Menus are built from a template and can be extended by calling `insertMenu` from various service modules (e.g., `workspaces/registerMenu.ts`, `windows/registerMenu.ts`).
- The menubar is rebuilt whenever new items are inserted.

### Context Menus (Webview & Workspace Icon)

- Webview right-click: Registered by `MenuService.initContextMenuForWindowWebContents`, which listens to the Electron `context-menu` event on each window's webContents.
- Workspace icon right-click: Handled in the renderer by `SortableWorkspaceSelectorButton.tsx`, which calls `getSimplifiedWorkspaceMenuTemplate` and triggers `window.remote.buildContextMenuAndPopup`.
- Both use the same menu template logic for workspace-related actions, ensuring consistency.

## Menu Template Structure

### getSimplifiedWorkspaceMenuTemplate

- Used for both context menu entry points.
- Provides frequently used workspace actions (AI, edit, git history, etc.) and a "Current Workspace" submenu with the full set of actions.
- Calls `getWorkspaceMenuTemplate` for the submenu.

### getWorkspaceMenuTemplate

- Returns the full set of actions for a workspace, including:
  - Open workspace tiddler
  - Open in new window
  - Edit workspace
  - View git history
  - Open workspace folder (in file manager, editor, or Git GUI)
  - Open in browser (if HTTP API enabled)
  - Remove workspace
  - Backup/Sync (if applicable)
  - Restart/Reload (for main wikis)
  - Back/Forward navigation (for main wikis)

## Extending the Menu

- To add new workspace actions, extend `getWorkspaceMenuTemplate`.
- To add global actions, use `MenuService.insertMenu` from any service module.

---

This design ensures that both the application menubar and all context menus remain consistent, extensible, and easy to maintain. For more details, see:

- `src/services/menu/index.ts`
- `src/services/workspaces/getWorkspaceMenuTemplate.ts`
- `src/pages/Main/WorkspaceIconAndSelector/SortableWorkspaceSelectorButton.tsx`
