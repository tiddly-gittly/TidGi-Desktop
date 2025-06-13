import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getWorkspaceMenuTemplate } from '@services/workspaces/getWorkspaceMenuTemplate';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { MouseEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceSelectorBase } from './WorkspaceSelectorBase';

import { PageType } from '@/constants/pageTypes';
import { getBuildInPageIcon } from '@/pages/Main/WorkspaceIconAndSelector/getBuildInPageIcon';
import { getBuildInPageName } from '@/pages/Main/WorkspaceIconAndSelector/getBuildInPageName';
import { WindowNames } from '@services/windows/WindowProperties';
import { useLocation } from 'wouter';

export interface ISortableItemProps {
  index: number;
  showSideBarIcon: boolean;
  showSidebarTexts: boolean;
  workspace: IWorkspaceWithMetadata;
}

export function SortableWorkspaceSelectorButton({ index, workspace, showSidebarTexts, showSideBarIcon }: ISortableItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { active, id, name, picturePath, hibernated, transparentBackground, pageType } = workspace;
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
  const onWorkspaceClick = useCallback(async () => {
    workspaceClickedLoadingSetter(true);
    try {
      if (workspace.pageType) {
        // Handle special "add" workspace
        if (workspace.pageType === PageType.add) {
          await window.service.window.open(WindowNames.addWorkspace);
        } else {
          // Handle other page workspaces - navigate to the page and set as active workspace
          setLocation(`/${workspace.pageType}`);
          await window.service.workspaceView.setActiveWorkspaceView(id);
        }
      } else {
        // Handle regular wiki workspace
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
  }, [id, setLocation, workspace]);
  const onWorkspaceContextMenu = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const workspaceContextMenuTemplate = await getWorkspaceMenuTemplate(workspace, t, window.service);
      void window.remote.buildContextMenuAndPopup(workspaceContextMenuTemplate, { x: event.clientX, y: event.clientY, editFlags: { canCopy: false } });
    },
    [t, workspace],
  );
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onContextMenu={onWorkspaceContextMenu}>
      <WorkspaceSelectorBase
        workspaceClickedLoading={workspaceClickedLoading}
        restarting={workspace.metadata.isRestarting}
        showSideBarIcon={showSideBarIcon}
        onClick={onWorkspaceClick}
        active={active}
        id={id}
        key={id}
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
