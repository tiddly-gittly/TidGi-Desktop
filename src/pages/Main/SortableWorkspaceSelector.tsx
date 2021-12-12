import { useCallback, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  const onWorkspaceClick = useCallback(async () => {
    try {
      await openWorkspaceTagTiddler(workspace, window.service);
    } catch (error) {
      if (error instanceof Error) {
        window.service.native.log('error', error.message);
      }
    }
  }, [workspace]);
  const onWorkspaceContextMenu = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const workspaceContextMenuTemplate = await getWorkspaceMenuTemplate(workspace, t, window.service);
      void window.remote.buildContextMenuAndPopup(workspaceContextMenuTemplate, { x: event.clientX, y: event.clientY, editFlags: { canCopy: false } });
    },
    [workspace],
  );
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onContextMenu={onWorkspaceContextMenu}>
      <WorkspaceSelector
        onClick={onWorkspaceClick}
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
