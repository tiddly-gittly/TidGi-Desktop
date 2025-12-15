import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PageType } from '@/constants/pageTypes';
import { WindowNames } from '@services/windows/WindowProperties';
import { IWorkspace, IWorkspaceWithMetadata } from '@services/workspaces/interface';
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

  // Optimistic order state - stores workspace IDs in the order they should be displayed
  // This updates immediately on drag end, before the backend confirms the change
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);
  // Track if we're waiting for backend to confirm the reorder
  const pendingReorderReference = useRef<boolean>(false);

  // Filter out 'add' workspace in mini window
  const baseFilteredList = useMemo(() => {
    if (isMiniWindow) {
      return workspacesList.filter((workspace) => workspace.pageType !== PageType.add);
    }
    return workspacesList;
  }, [isMiniWindow, workspacesList]);

  // Apply optimistic order if present, otherwise use natural order from props
  const filteredWorkspacesList = useMemo(() => {
    if (optimisticOrder === null) {
      // No optimistic order, sort by order property
      return [...baseFilteredList].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    // Apply optimistic order
    const orderMap = new Map(optimisticOrder.map((id, index) => [id, index]));
    return [...baseFilteredList].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? a.order ?? 0;
      const orderB = orderMap.get(b.id) ?? b.order ?? 0;
      return orderA - orderB;
    });
  }, [baseFilteredList, optimisticOrder]);

  // When workspacesList updates from backend, clear optimistic order if pending
  useEffect(() => {
    if (pendingReorderReference.current) {
      pendingReorderReference.current = false;
      setOptimisticOrder(null);
    }
  }, [workspacesList]);

  const workspaceIDs = filteredWorkspacesList.map((workspace) => workspace.id);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const oldIndex = filteredWorkspacesList.findIndex(workspace => workspace.id === activeId);
    const newIndex = filteredWorkspacesList.findIndex(workspace => workspace.id === overId);

    if (oldIndex === -1 || newIndex === -1) return;

    // OPTIMISTIC UPDATE: Immediately update the display order
    const newOrderedList = arrayMove(filteredWorkspacesList, oldIndex, newIndex);
    const newOrder = newOrderedList.map(w => w.id);
    setOptimisticOrder(newOrder);
    pendingReorderReference.current = true;

    // Prepare data for backend update
    const newWorkspaces: Record<string, IWorkspace> = {};
    newOrderedList.forEach((workspace, index) => {
      newWorkspaces[workspace.id] = { ...workspace };
      newWorkspaces[workspace.id].order = index;
    });

    // Update backend (this will eventually trigger workspacesList update via Observable)
    await window.service.workspace.setWorkspaces(newWorkspaces);
  }, [filteredWorkspacesList]);

  return (
    <DndContext
      sensors={dndSensors}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={workspaceIDs} strategy={verticalListSortingStrategy}>
        {filteredWorkspacesList.map((workspace, index) => (
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
