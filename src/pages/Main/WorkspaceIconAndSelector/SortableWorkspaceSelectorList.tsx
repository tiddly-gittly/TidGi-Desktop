import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useMemo } from 'react';

import { PageType } from '@/constants/pageTypes';
import { WindowNames } from '@services/windows/WindowProperties';
import { IWorkspace, IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { workspaceSorter } from '@services/workspaces/utilities';
import { SortableWorkspaceSelectorButton } from './SortableWorkspaceSelectorButton';

export interface ISortableListProps {
  showSideBarIcon: boolean;
  showSideBarText: boolean;
  workspacesList: IWorkspaceWithMetadata[];
}

export function SortableWorkspaceSelectorList({ workspacesList, showSideBarText, showSideBarIcon }: ISortableListProps): React.JSX.Element {
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const isMiniWindow = window.meta().windowName === WindowNames.tidgiMiniWindow;

  // Filter out 'add' workspace in mini window
  const filteredWorkspacesList = useMemo(() => {
    if (isMiniWindow) {
      return workspacesList.filter((workspace) => workspace.pageType !== PageType.add);
    }
    return workspacesList;
  }, [isMiniWindow, workspacesList]);

  const workspaceIDs = filteredWorkspacesList.map((workspace) => workspace.id);

  return (
    <DndContext
      sensors={dndSensors}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={async ({ active, over }) => {
        if (over === null || active.id === over.id) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        const oldIndex = workspacesList.findIndex(workspace => workspace.id === activeId);
        const newIndex = workspacesList.findIndex(workspace => workspace.id === overId);

        if (oldIndex === -1 || newIndex === -1) return;

        const newWorkspacesList = arrayMove(workspacesList, oldIndex, newIndex);
        const newWorkspaces: Record<string, IWorkspace> = {};
        newWorkspacesList.forEach((workspace, index) => {
          newWorkspaces[workspace.id] = workspace;
          newWorkspaces[workspace.id].order = index;
        });

        await window.service.workspace.setWorkspaces(newWorkspaces);
      }}
    >
      <SortableContext items={workspaceIDs} strategy={verticalListSortingStrategy}>
        {filteredWorkspacesList
          .sort(workspaceSorter)
          .map((workspace, index) => (
            <SortableWorkspaceSelectorButton
              key={`item-${workspace.id}`}
              index={index}
              workspace={workspace}
              showSidebarTexts={showSideBarText}
              showSideBarIcon={showSideBarIcon}
            />
          ))}
      </SortableContext>
    </DndContext>
  );
}
