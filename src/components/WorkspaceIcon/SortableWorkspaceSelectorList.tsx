import { DndContext, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { IWorkspace, IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { SortableWorkspaceSelector } from './SortableWorkspaceSelector';

export interface ISortableListProps {
  sidebarShortcutHints: boolean;
  workspacesList: IWorkspaceWithMetadata[];
}

export function SortableWorkspaceSelectorList({ workspacesList, sidebarShortcutHints }: ISortableListProps): JSX.Element {
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const workspaceIDs = workspacesList?.map((workspace) => workspace.id) ?? [];

  return (
    <DndContext
      sensors={dndSensors}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={async ({ active, over }) => {
        if (over === null || active.id === over.id) return;
        const oldIndex = workspaceIDs.indexOf(active.id);
        const newIndex = workspaceIDs.indexOf(over.id);

        const newWorkspacesList = arrayMove(workspacesList, oldIndex, newIndex);
        const newWorkspaces: Record<string, IWorkspace> = {};
        newWorkspacesList.forEach((workspace, index) => {
          newWorkspaces[workspace.id] = workspace;
          newWorkspaces[workspace.id].order = index;
        });

        await window.service.workspace.setWorkspaces(newWorkspaces);
      }}>
      <SortableContext items={workspaceIDs} strategy={verticalListSortingStrategy}>
        {workspacesList
          .sort((a, b) => a.order - b.order)
          .map((workspace, index) => (
            <SortableWorkspaceSelector
              key={`item-${workspace.id}`}
              index={index}
              workspace={workspace}
              showSidebarShortcutHints={sidebarShortcutHints}
              workspaceCount={workspaceIDs.length}
            />
          ))}
      </SortableContext>
    </DndContext>
  );
}
