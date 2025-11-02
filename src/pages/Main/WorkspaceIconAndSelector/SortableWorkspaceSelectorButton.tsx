import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MenuItemConstructorOptions } from 'electron';
import { MouseEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

import { WikiChannel } from '@/constants/channels';
import { PageType } from '@/constants/pageTypes';
import { getBuildInPageIcon } from '@/pages/Main/WorkspaceIconAndSelector/getBuildInPageIcon';
import { getBuildInPageName } from '@/pages/Main/WorkspaceIconAndSelector/getBuildInPageName';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { getSimplifiedWorkspaceMenuTemplate, getWorkspaceMenuTemplate } from '@services/workspaces/getWorkspaceMenuTemplate';
import { isWikiWorkspace, IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { WorkspaceSelectorBase } from './WorkspaceSelectorBase';

export interface ISortableItemProps {
  index: number;
  showSideBarIcon: boolean;
  showSidebarTexts: boolean;
  workspace: IWorkspaceWithMetadata;
}

export function SortableWorkspaceSelectorButton({ index, workspace, showSidebarTexts, showSideBarIcon }: ISortableItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { active, id, name, picturePath, pageType } = workspace;
  const preference = usePreferenceObservable();

  const isWiki = isWikiWorkspace(workspace);
  const hibernated = isWiki ? workspace.hibernated : false;
  const transparentBackground = isWiki ? workspace.transparentBackground : false;

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };
  const [workspaceClickedLoading, workspaceClickedLoadingSetter] = useState(false);
  const [, setLocation] = useLocation();

  // Get page-specific name and icon if this is a page workspace
  const displayName = useMemo(() => {
    if (pageType) {
      return getBuildInPageName(pageType, t);
    }
    return name;
  }, [pageType, name, t]);

  const customIcon = useMemo(() => {
    if (pageType) {
      return getBuildInPageIcon(pageType);
    }
    return undefined;
  }, [pageType]);

  const isMiniWindow = window.meta().windowName === WindowNames.tidgiMiniWindow;

  // Determine active state based on window type
  const isActive = useMemo(() => {
    if (isMiniWindow) {
      // In mini window, compare with tidgiMiniWindowFixedWorkspaceId
      return preference?.tidgiMiniWindowFixedWorkspaceId === id;
    }
    // In main window, use workspace's active state
    return active;
  }, [isMiniWindow, preference?.tidgiMiniWindowFixedWorkspaceId, id, active]);

  const onWorkspaceClick = useCallback(async () => {
    workspaceClickedLoadingSetter(true);
    try {
      // Special "add" workspace always opens add workspace window
      if (workspace.pageType === PageType.add) {
        await window.service.window.open(WindowNames.addWorkspace);
        return;
      }

      // In mini window, only update the fixed workspace ID
      if (isMiniWindow) {
        await window.service.preference.set('tidgiMiniWindowFixedWorkspaceId', id);
        return;
      }

      // In main window, handle different workspace types
      if (workspace.pageType) {
        // Page workspaces (dashboard, etc.)
        setLocation(`/${workspace.pageType}`);
        await window.service.workspaceView.setActiveWorkspaceView(id);
      } else {
        // Regular wiki workspace
        setLocation(`/${PageType.wiki}/${id}/`);
        await window.service.workspace.openWorkspaceTiddler(workspace);
      }
    } catch (error) {
      if (error instanceof Error) {
        await window.service.native.log('error', error.message);
      }
    } finally {
      workspaceClickedLoadingSetter(false);
    }
  }, [id, setLocation, workspace, isMiniWindow]);
  const onWorkspaceContextMenu = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      // Build workspace context menu template - provide all workspace-specific content here
      const workspaceContextMenuTemplate: MenuItemConstructorOptions[] = [];

      // Add command palette first (before other items)
      if (isWiki) {
        workspaceContextMenuTemplate.push({
          label: t('ContextMenu.OpenCommandPalette'),
          click: async () => {
            await window.service.wiki.wikiOperationInBrowser(WikiChannel.dispatchEvent, workspace.id, ['open-command-palette']);
          },
        });
      }

      // Add simplified menu items
      const simplifiedMenuItems = await getSimplifiedWorkspaceMenuTemplate(workspace, t, window.service);
      workspaceContextMenuTemplate.push(...simplifiedMenuItems);

      // Add "Current Workspace" submenu with full menu (only for wiki workspaces)
      if (isWiki) {
        const fullMenuTemplate = await getWorkspaceMenuTemplate(workspace, t, window.service);
        if (fullMenuTemplate.length > 0) {
          // Add separator before "Current Workspace"
          workspaceContextMenuTemplate.push({ type: 'separator' });
          // Add "Current Workspace" submenu
          workspaceContextMenuTemplate.push({
            label: t('Menu.CurrentWorkspace'),
            submenu: fullMenuTemplate,
          });
        }
      }
      void window.remote.buildContextMenuAndPopup(workspaceContextMenuTemplate, {
        x: event.clientX,
        y: event.clientY,
        editFlags: { canCopy: false },
      });
    },
    [t, workspace, isWiki],
  );
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onContextMenu={onWorkspaceContextMenu}>
      <WorkspaceSelectorBase
        workspaceClickedLoading={workspaceClickedLoading}
        restarting={workspace.metadata.isRestarting}
        showSideBarIcon={showSideBarIcon}
        onClick={onWorkspaceClick}
        active={isActive}
        id={id}
        key={id}
        pageType={pageType || undefined}
        workspaceName={displayName}
        picturePath={picturePath}
        customIcon={customIcon}
        transparentBackground={transparentBackground}
        index={index}
        hibernated={hibernated}
        showSidebarTexts={showSidebarTexts}
      />
    </div>
  );
}
