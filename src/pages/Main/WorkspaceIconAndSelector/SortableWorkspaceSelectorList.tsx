import { closestCenter, DndContext, DragEndEvent, DragOverEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Collapse, styled } from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { PageType } from '@/constants/pageTypes';
import { WindowNames } from '@services/windows/WindowProperties';
import { IWorkspace, IWorkspaceGroup, IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { useWorkspaceGroupsListObservable } from '@services/workspaces/hooks';
import { SortableWorkspaceSelectorButton } from './SortableWorkspaceSelectorButton';

const GroupHeader = styled('div', { shouldForwardProp: (prop) => !/^\$/.test(String(prop)) })<{ $isDragging?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  opacity: ${({ $isDragging }) => ($isDragging ? 0.5 : 1)};
  transition: opacity 0.2s ease;
  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }
`;

const GroupTitle = styled('span')`
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

const GroupContent = styled('div')`
  padding-left: 8px;
`;

const UngroupedSection = styled('div')`
  margin-bottom: 8px;
`;

export interface ISortableListProps {
  showSideBarIcon: boolean;
  showSideBarText: boolean;
  workspacesList: IWorkspaceWithMetadata[];
}

interface SortableGroupProps {
  group: IWorkspaceGroup;
  workspaces: IWorkspaceWithMetadata[];
  showSideBarIcon: boolean;
  showSidebarTexts: boolean;
  onToggleCollapse: (groupId: string) => void;
}

function SortableGroup({ group, workspaces, showSideBarIcon, showSidebarTexts, onToggleCollapse }: SortableGroupProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: `group-${group.id}`,
    data: { type: 'group', group }
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  const workspaceIds = workspaces.map(w => w.id);

  return (
    <div ref={setNodeRef} style={style} data-testid={`workspace-group-${group.id}`}>
      <GroupHeader 
        $isDragging={isDragging}
        onClick={() => onToggleCollapse(group.id)}
        {...attributes}
        {...listeners}
      >
        {group.collapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        <GroupTitle>{group.name}</GroupTitle>
      </GroupHeader>
      <Collapse in={!group.collapsed} timeout="auto" unmountOnExit>
        <GroupContent>
          <SortableContext items={workspaceIds} strategy={verticalListSortingStrategy}>
            {workspaces.map((workspace, index) => (
              <SortableWorkspaceSelectorButton
                key={`item-${workspace.id}`}
                index={index}
                workspace={workspace}
                showSidebarTexts={showSidebarTexts}
                showSideBarIcon={showSideBarIcon}
              />
            ))}
          </SortableContext>
        </GroupContent>
      </Collapse>
    </div>
  );
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
  const groups = useWorkspaceGroupsListObservable();

  // Optimistic state for workspace and group reordering
  const [optimisticWorkspaceOrder, setOptimisticWorkspaceOrder] = useState<string[] | null>(null);
  const [optimisticGroupOrder, setOptimisticGroupOrder] = useState<string[] | null>(null);
  const pendingReorderReference = useRef<boolean>(false);

  // Filter out 'add' workspace in mini window
  const baseFilteredList = useMemo(() => {
    if (isMiniWindow) {
      return workspacesList.filter((workspace) => workspace.pageType !== PageType.add);
    }
    return workspacesList;
  }, [isMiniWindow, workspacesList]);

  // Apply optimistic order to workspaces
  const orderedWorkspaces = useMemo(() => {
    if (optimisticWorkspaceOrder === null) {
      return [...baseFilteredList].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    const orderMap = new Map(optimisticWorkspaceOrder.map((id, index) => [id, index]));
    return [...baseFilteredList].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? a.order ?? 0;
      const orderB = orderMap.get(b.id) ?? b.order ?? 0;
      return orderA - orderB;
    });
  }, [baseFilteredList, optimisticWorkspaceOrder]);

  // Apply optimistic order to groups
  const orderedGroups = useMemo(() => {
    if (!groups) return [];
    if (optimisticGroupOrder === null) {
      return [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    const orderMap = new Map(optimisticGroupOrder.map((id, index) => [id, index]));
    return [...groups].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? a.order ?? 0;
      const orderB = orderMap.get(b.id) ?? b.order ?? 0;
      return orderA - orderB;
    });
  }, [groups, optimisticGroupOrder]);

  // Separate ungrouped and grouped workspaces
  const { ungroupedWorkspaces, groupedWorkspaces } = useMemo(() => {
    const ungrouped: IWorkspaceWithMetadata[] = [];
    const grouped: Record<string, IWorkspaceWithMetadata[]> = {};

    orderedWorkspaces.forEach(workspace => {
      if (!workspace.groupId) {
        ungrouped.push(workspace);
      } else {
        if (!grouped[workspace.groupId]) {
          grouped[workspace.groupId] = [];
        }
        grouped[workspace.groupId].push(workspace);
      }
    });

    return { ungroupedWorkspaces: ungrouped, groupedWorkspaces: grouped };
  }, [orderedWorkspaces]);

  // Clear optimistic state when backend updates
  useEffect(() => {
    if (pendingReorderReference.current) {
      pendingReorderReference.current = false;
      setOptimisticWorkspaceOrder(null);
      setOptimisticGroupOrder(null);
    }
  }, [workspacesList, groups]);

  // Collect all draggable IDs (workspaces + groups)
  const allDraggableIds = useMemo(() => {
    const workspaceIds = orderedWorkspaces.map(w => w.id);
    const groupIds = orderedGroups.map(g => `group-${g.id}`);
    return [...workspaceIds, ...groupIds];
  }, [orderedWorkspaces, orderedGroups]);

  const handleToggleCollapse = useCallback(async (groupId: string) => {
    const group = groups?.find(g => g.id === groupId);
    if (!group) return;
    
    await window.service.workspace.setGroup(groupId, {
      ...group,
      collapsed: !group.collapsed,
    });
  }, [groups]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !active.data.current) return;

    const activeType = active.data.current.type;
    const overId = String(over.id);

    // Handle workspace dragged over group
    if (activeType === 'workspace' && overId.startsWith('group-')) {
      // Visual feedback handled by CSS
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeData = active.data.current;

    // Case 1: Workspace dropped on group
    if (activeData?.type === 'workspace' && overId.startsWith('group-')) {
      const groupId = overId.replace('group-', '');
      await window.service.workspace.moveWorkspaceToGroup(activeId, groupId);
      return;
    }

    // Case 2: Group reordering
    if (activeId.startsWith('group-') && overId.startsWith('group-')) {
      const activeGroupId = activeId.replace('group-', '');
      const overGroupId = overId.replace('group-', '');
      
      const oldIndex = orderedGroups.findIndex(g => g.id === activeGroupId);
      const newIndex = orderedGroups.findIndex(g => g.id === overGroupId);
      
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedGroups = arrayMove(orderedGroups, oldIndex, newIndex);
      setOptimisticGroupOrder(reorderedGroups.map(g => g.id));
      pendingReorderReference.current = true;

      // Update all group orders
      await Promise.all(
        reorderedGroups.map((group, index) =>
          window.service.workspace.setGroup(group.id, { ...group, order: index })
        )
      );
      return;
    }

    // Case 3: Workspace reordering (within same group or ungrouped)
    if (activeData?.type === 'workspace' || !activeId.startsWith('group-')) {
      const oldIndex = orderedWorkspaces.findIndex(w => w.id === activeId);
      const newIndex = orderedWorkspaces.findIndex(w => w.id === overId);
      
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedWorkspaces = arrayMove(orderedWorkspaces, oldIndex, newIndex);
      setOptimisticWorkspaceOrder(reorderedWorkspaces.map(w => w.id));
      pendingReorderReference.current = true;

      const newWorkspaces: Record<string, IWorkspace> = {};
      reorderedWorkspaces.forEach((workspace, index) => {
        newWorkspaces[workspace.id] = { ...workspace, order: index };
      });

      await window.service.workspace.setWorkspaces(newWorkspaces);
    }
  }, [orderedWorkspaces, orderedGroups]);

  return (
    <DndContext
      sensors={dndSensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={allDraggableIds} strategy={verticalListSortingStrategy}>
        {/* Ungrouped workspaces */}
        {ungroupedWorkspaces.length > 0 && (
          <UngroupedSection>
            {ungroupedWorkspaces.map((workspace, index) => (
              <SortableWorkspaceSelectorButton
                key={`item-${workspace.id}`}
                index={index}
                workspace={workspace}
                showSidebarTexts={showSideBarText}
                showSideBarIcon={showSideBarIcon}
              />
            ))}
          </UngroupedSection>
        )}

        {/* Grouped workspaces */}
        {orderedGroups.map(group => {
          const workspacesInGroup = groupedWorkspaces[group.id] || [];
          if (workspacesInGroup.length === 0) return null;
          
          return (
            <SortableGroup
              key={group.id}
              group={group}
              workspaces={workspacesInGroup}
              showSideBarIcon={showSideBarIcon}
              showSidebarTexts={showSideBarText}
              onToggleCollapse={handleToggleCollapse}
            />
          );
        })}
      </SortableContext>
    </DndContext>
  );
}
