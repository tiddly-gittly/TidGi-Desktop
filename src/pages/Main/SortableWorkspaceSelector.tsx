import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WindowNames } from '@services/windows/WindowProperties';
import WorkspaceSelector from './WorkspaceSelector';
import { IWorkspace } from '@services/workspaces/interface';
import { getWorkspaceMenuTemplate, openWorkspaceTagTiddler } from '@services/workspaces/getWorkspaceMenuTemplate';

import defaultIcon from '@/images/default-icon.png';

export interface ISortableItemProps {
  index: number;
  showSidebarShortcutHints: boolean;
  workspace: IWorkspace;
}

export function SortableWorkspaceSelector({ index, workspace, showSidebarShortcutHints }: ISortableItemProps): JSX.Element {
  const { t } = useTranslation();
  const { active, id, name, picturePath, hibernated, transparentBackground } = workspace;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={async () => await openWorkspaceTagTiddler(workspace, window.service)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const workspaceContextMenuTemplate = getWorkspaceMenuTemplate(workspace, t, window.service);
        void window.remote.buildContextMenuAndPopup(workspaceContextMenuTemplate, { x: event.clientX, y: event.clientY, editFlags: { canCopy: false } });
      }}>
      <WorkspaceSelector
        active={active}
        id={id}
        key={id}
        workspaceName={name}
        picturePath={picturePath ?? defaultIcon}
        transparentBackground={transparentBackground}
        index={index}
        hibernated={hibernated}
        showSidebarShortcutHints={showSidebarShortcutHints}
      />
    </div>
  );
}
