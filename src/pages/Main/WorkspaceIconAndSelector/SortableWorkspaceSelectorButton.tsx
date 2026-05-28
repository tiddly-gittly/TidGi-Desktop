import { useSortable } from '@dnd-kit/sortable';
import { Box, styled } from '@mui/material';
import { MouseEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

import { PageType } from '@/constants/pageTypes';
import { getBuildInPageIcon } from '@/pages/Main/WorkspaceIconAndSelector/getBuildInPageIcon';
import { getBuildInPageName } from '@/pages/Main/WorkspaceIconAndSelector/getBuildInPageName';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { WindowNames } from '@services/windows/WindowProperties';
import { getSimplifiedWorkspaceMenuTemplate } from '@services/workspaces/getWorkspaceMenuTemplate';
import { isWikiWorkspace, IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { useDragContext } from './SortableWorkspaceSelectorList';
import { WorkspaceSelectorBase } from './WorkspaceSelectorBase';

const DragOverlayContainer = styled(Box)`
  position: relative;
  border-radius: 4px;
  transition: background-color 0.15s ease;
`;

const WorkspaceDropZone = styled('div', {
  shouldForwardProp: (propertyName) => !/^\$/.test(String(propertyName)),
})<{ $bottom?: boolean; $center?: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: auto;
  z-index: 2;
  background: transparent;
`;

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
  const dragContext = useDragContext();

  const isWiki = isWikiWorkspace(workspace);
  const hibernated = isWiki ? workspace.hibernated : false;
  const transparentBackground = isWiki ? workspace.transparentBackground : false;

  // Only pass groupId in data to keep the reference stable when workspaces$
  // emits new objects with identical groupId values. Passing the whole
  // workspace object caused dnd-kit useSortable to re-register on every
  // emission, triggering an infinite render loop.
  const sortableData = useMemo(() => ({ type: 'workspace' as const, groupId: workspace.groupId }), [workspace.groupId]);
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id,
    data: sortableData,
  });

  const isDragOverTarget = dragContext.overId === id;
  const dragIntent = isDragOverTarget ? dragContext.intent : null;
  const isAnyDragActive = dragContext.activeId !== null;

  const style = {
    transform: 'translate3d(0, 0, 0)',
    transition: 'none',
    opacity: isDragging ? 0 : undefined,
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
    if (isAnyDragActive) {
      return;
    }

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
  }, [id, isAnyDragActive, isMiniWindow, setLocation, workspace]);
  const onWorkspaceContextMenu = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      // Build workspace context menu template - simplified menu now includes everything.
      // Pass onTriggerTalkWithAI so that the renderer-side click handler can emit the event
      // locally instead of trying to obtain a non-serialisable BrowserWindow via IPC.
      const workspaceContextMenuTemplate = await getSimplifiedWorkspaceMenuTemplate(workspace, t, window.service, {
        onTriggerTalkWithAI: (data) => {
          window.remote.triggerAskAIWithSelection(data);
        },
      });
      void window.remote.buildContextMenuAndPopup(workspaceContextMenuTemplate, {
        x: event.clientX,
        y: event.clientY,
        editFlags: { canCopy: false },
      });
    },
    [t, workspace],
  );

  return (
    <DragOverlayContainer
      ref={(node) => {
        setNodeRef(node as HTMLElement | null);
      }}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={onWorkspaceContextMenu}
      data-testid={`workspace-item-${id}`}
    >
      <WorkspaceDropZone data-testid={`workspace-drop-zone-${id}-top`} style={{ top: 0, height: '33%', pointerEvents: 'none' }} />
      <WorkspaceDropZone data-testid={`workspace-drop-zone-${id}-center`} $center style={{ top: '33%', height: '34%', pointerEvents: 'none' }} />
      <WorkspaceDropZone data-testid={`workspace-drop-zone-${id}-bottom`} $bottom style={{ bottom: 0, height: '33%', pointerEvents: 'none' }} />
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
        dragIntent={dragIntent}
      />
    </DragOverlayContainer>
  );
}
