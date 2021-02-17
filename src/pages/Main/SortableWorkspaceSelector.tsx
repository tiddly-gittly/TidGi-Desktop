import React from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { SortableContainer as sortableContainer, SortableElement as sortableElement } from 'react-sortable-hoc';
import { WindowNames } from '@services/windows/WindowProperties';
import WorkspaceSelector from './workspace-selector';
import { IWorkspace } from '@services/workspaces/interface';

export const SortableContainer = sortableContainer(({ children }: { children: React.ReactNode }) => <div>{children}</div>);

export interface ISortableItemProps {
  value: {
    index: number;
    workspace: IWorkspace;
  };
  t: WithTranslation['t'];
}

export const SortableItem = sortableElement(
  withTranslation()(({ value, t }: ISortableItemProps) => {
    const { index, workspace } = value;
    const { active, id, name, picturePath, hibernated, transparentBackground, isSubWiki, tagName } = workspace;
    return (
      <WorkspaceSelector
        active={active}
        id={id}
        key={id}
        name={name}
        picturePath={picturePath}
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
        onContextMenu={(event: Event) => {
          event.preventDefault();

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
  }),
);
