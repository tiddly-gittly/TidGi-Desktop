import React from 'react';
import { useTranslation } from 'react-i18next';
import { SortableContainer as sortableContainer, SortableElement as sortableElement } from 'react-sortable-hoc';
import { WindowNames } from '@services/windows/WindowProperties';
import WorkspaceSelector from './WorkspaceSelector';
import { IWorkspace } from '@services/workspaces/interface';

import defaultIcon from '../../images/default-icon.png';

export const SortableContainer = sortableContainer(({ children }: { children: React.ReactNode }) => <div>{children}</div>);

export interface ISortableItemProps {
  index: number;
  workspace: IWorkspace;
}

function SortableWorkspaceSelector({ index, workspace }: ISortableItemProps) {
  const { t } = useTranslation();
  const { active, id, name, picturePath, hibernated, transparentBackground, isSubWiki, tagName } = workspace;
  return (
    <WorkspaceSelector
      active={active}
      id={id}
      key={id}
      workspaceName={name}
      picturePath={picturePath ?? defaultIcon}
      transparentBackground={transparentBackground}
      order={index}
      hibernated={hibernated}
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
      onContextMenu={() => {
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

        void window.service.menu.buildContextMenuAndPopup(template);
      }}
    />
  );
}

export default sortableElement(SortableWorkspaceSelector);
