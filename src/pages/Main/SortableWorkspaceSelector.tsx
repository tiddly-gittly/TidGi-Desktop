import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WindowNames } from '@services/windows/WindowProperties';
import WorkspaceSelector from './WorkspaceSelector';
import { IWorkspace } from '@services/workspaces/interface';

import defaultIcon from '@/images/default-icon.png';

export interface ISortableItemProps {
  index: number;
  workspace: IWorkspace;
}

export function SortableWorkspaceSelector({ index, workspace }: ISortableItemProps): JSX.Element {
  const { t } = useTranslation();
  const { active, id, name, picturePath, hibernated, transparentBackground, isSubWiki, tagName } = workspace;
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={async () => {
        if (isSubWiki) {
          await window.service.wiki.requestOpenTiddlerInWiki(tagName);
        } else {
          const activeWorkspace = await window.service.workspace.getActiveWorkspace();
          if (activeWorkspace?.id === id) {
            await window.service.wiki.requestWikiSendActionMessage('tm-home');
          } else {
            await window.service.workspaceView.setActiveWorkspaceView(id);
          }
        }
      }}
      onContextMenu={(event) => {
        const template = [
          {
            label: t('WorkspaceSelector.EditWorkspace'),
            click: async () => await window.service.window.open(WindowNames.editWorkspace, { workspaceID: id }),
          },
          {
            label: t('WorkspaceSelector.RemoveWorkspace'),
            click: async () => await window.service.workspaceView.removeWorkspaceView(id),
          },
        ];

        if (!active && !isSubWiki) {
          template.splice(1, 0, {
            label: hibernated ? 'Wake Up Workspace' : 'Hibernate Workspace',
            click: async () => {
              if (hibernated) {
                return await window.service.workspaceView.wakeUpWorkspaceView(id);
              }
              return await window.service.workspaceView.hibernateWorkspaceView(id);
            },
          });
        }

        void window.service.menu.buildContextMenuAndPopup(template, { x: event.clientX, y: event.clientY }, window.meta.windowName);
      }}>
      <WorkspaceSelector
        active={active}
        id={id}
        key={id}
        workspaceName={name}
        picturePath={picturePath ?? defaultIcon}
        transparentBackground={transparentBackground}
        order={index}
        hibernated={hibernated}
        showSidebarShortcutHints
      />
    </div>
  );
}
