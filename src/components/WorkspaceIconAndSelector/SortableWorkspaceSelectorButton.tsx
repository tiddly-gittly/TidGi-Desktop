import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getWorkspaceMenuTemplate, openWorkspaceTagTiddler } from '@services/workspaces/getWorkspaceMenuTemplate';
import { IWorkspace } from '@services/workspaces/interface';
import { MouseEvent, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceSelectorBase } from './WorkspaceSelectorBase';

import defaultIcon from '@/images/default-icon.png';
import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useLocation } from 'wouter';

export interface ISortableItemProps {
  index: number;
  showSideBarIcon: boolean;
  showSidebarTexts: boolean;
  workspace: IWorkspace;
}

export function SortableWorkspaceSelectorButton({ index, workspace, showSidebarTexts, showSideBarIcon }: ISortableItemProps): JSX.Element {
  const { t } = useTranslation();
  const { active, id, name, picturePath, hibernated, transparentBackground } = workspace;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };
  const [workspaceClickedLoading, workspaceClickedLoadingSetter] = useState(false);
  const [, setLocation] = useLocation();
  const onWorkspaceClick = useCallback(async () => {
    workspaceClickedLoadingSetter(true);
    try {
      await openWorkspaceTagTiddler(workspace, window.service);
      setLocation(`/${WindowNames.main}/${PageType.wiki}/${id}/`);
    } catch (error) {
      if (error instanceof Error) {
        await window.service.native.log('error', error.message);
      }
    }
    workspaceClickedLoadingSetter(false);
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
        showSideBarIcon={showSideBarIcon}
        onClick={onWorkspaceClick}
        active={active}
        id={id}
        key={id}
        workspaceName={name}
        picturePath={picturePath ?? defaultIcon}
        transparentBackground={transparentBackground}
        index={index}
        hibernated={hibernated}
        showSidebarTexts={showSidebarTexts}
      />
    </div>
  );
}
