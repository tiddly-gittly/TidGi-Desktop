import { closestCenter, CollisionDetection, DndContext, DragEndEvent, DragOverEvent, PointerSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Avatar, Collapse, styled, Tooltip } from '@mui/material';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageType } from '@/constants/pageTypes';
import { PreferenceSections } from '@services/preferences/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspaceGroupsListObservable } from '@services/workspaces/hooks';
import { IWorkspace, IWorkspaceGroup, IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { SortableWorkspaceSelectorButton } from './SortableWorkspaceSelectorButton';

// ─── Styled Components ───────────────────────────────────────────────

const GroupHeader = styled('div', { shouldForwardProp: (property) => !/^\$/.test(String(property)) })<
  { $isDragging?: boolean; $dragIntent?: 'group' | 'ungroup' | 'reorder-before' | 'reorder-after' | null }
>`
  display: flex;
  align-items: center;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  opacity: ${({ $isDragging }) => ($isDragging ? 0.5 : 1)};
  transition: opacity 0.2s ease, background-color 0.15s ease;
  border-radius: 4px;
  margin-top: 4px;
  ${({ $dragIntent, theme }) =>
  $dragIntent === 'group'
    ? `background-color: ${theme.palette.primary.light}40; outline: 2px dashed ${theme.palette.primary.main};`
    : $dragIntent === 'ungroup'
    ? `background-color: ${theme.palette.error.light}40; outline: 2px dashed ${theme.palette.error.main};`
    : $dragIntent === 'reorder-before' || $dragIntent === 'reorder-after'
    ? `background-color: ${theme.palette.action.hover};`
    : ''}
  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }
`;

const GroupTitle = styled('span')`
  flex: 1;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.palette.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  margin-left: 6px;
`;

const GroupContent = styled('div')`
  padding-left: 8px;
`;

const UngroupedSection = styled('div')`
  margin-bottom: 4px;
`;

// ─── Drag Context ────────────────────────────────────────────────────

type TDragIntent = 'group' | 'ungroup' | 'reorder-before' | 'reorder-after' | null;

interface IDragContextValue {
  intent: TDragIntent;
  overId: string | null;
}

const DragContext = React.createContext<IDragContextValue>({ intent: null, overId: null });

export function useDragContext(): IDragContextValue {
  return React.useContext(DragContext);
}

// ─── Props ───────────────────────────────────────────────────────────

export interface ISortableListProps {
  showSideBarIcon: boolean;
  showSideBarText: boolean;
  workspacesList: IWorkspaceWithMetadata[];
}

interface SortableGroupHeaderProps {
  group: IWorkspaceGroup;
  onToggleCollapse: (groupId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isGroupableWorkspace(workspace: IWorkspaceWithMetadata | undefined): boolean {
  return workspace !== undefined && !workspace.pageType;
}

function getGroupInitial(name: string): string {
  if (!name) return 'G';
  const first = name.trim().charAt(0);
  return first.toUpperCase();
}

function getWorkspaceZoneIntent({
  activeRect,
  canGroup,
  overRect,
  pointerY,
}: {
  activeRect: { height: number; top: number } | null | undefined;
  canGroup: boolean;
  overRect: { height: number; top: number };
  pointerY: number | null | undefined;
}): Exclude<TDragIntent, 'ungroup' | null> {
  const fallbackY = activeRect ? activeRect.top + activeRect.height / 2 : overRect.top + overRect.height / 2;
  const resolvedPointerY = pointerY ?? fallbackY;
  const relativeY = Math.min(Math.max(resolvedPointerY - overRect.top, 0), overRect.height);
  const beforeBoundary = overRect.height / 3;
  const afterBoundary = overRect.height - beforeBoundary;

  if (relativeY <= beforeBoundary) {
    return 'reorder-before';
  }

  if (relativeY >= afterBoundary) {
    return 'reorder-after';
  }

  if (canGroup) {
    return 'group';
  }

  return relativeY < overRect.height / 2 ? 'reorder-before' : 'reorder-after';
}

// ─── SortableGroupHeader ─────────────────────────────────────────────

function SortableGroupHeader({ group, onToggleCollapse }: SortableGroupHeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group-${group.id}`,
    data: { type: 'group', group },
  });

  const dragContext = useDragContext();
  const isDragOverTarget = dragContext.overId === `group-${group.id}`;
  const dragIntent = isDragOverTarget ? dragContext.intent : null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  const handleContextMenu = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const template = [
      {
        label: t('WorkspaceGroup.EditGroup'),
        click: async () => {
          await window.service.window.open(WindowNames.preferences, { preferenceGotoTab: PreferenceSections.workspaceGroups });
        },
      },
    ];
    void window.remote.buildContextMenuAndPopup(template, {
      x: event.clientX,
      y: event.clientY,
      editFlags: { canCopy: false },
    });
  }, [t]);

  return (
    <GroupHeader
      ref={setNodeRef}
      style={style}
      $isDragging={isDragging}
      $dragIntent={dragIntent}
      onClick={() => {
        onToggleCollapse(group.id);
      }}
      onContextMenu={handleContextMenu}
      {...attributes}
      {...listeners}
      data-testid={`workspace-group-${group.id}`}
    >
      {group.collapsed ? <ChevronRightIcon fontSize='small' /> : <ExpandMoreIcon fontSize='small' />}
      <Avatar
        sx={{
          width: 20,
          height: 20,
          fontSize: 10,
          fontWeight: 600,
          ml: 0.5,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        {getGroupInitial(group.name)}
      </Avatar>
      <Tooltip title={group.name} placement='top'>
        <GroupTitle>{group.name}</GroupTitle>
      </Tooltip>
    </GroupHeader>
  );
}

// ─── SortableWorkspaceSelectorList ───────────────────────────────────

export function SortableWorkspaceSelectorList({ workspacesList, showSideBarText, showSideBarIcon }: ISortableListProps): React.JSX.Element {
  const { t } = useTranslation();
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const isMiniWindow = window.meta().windowName === WindowNames.tidgiMiniWindow;
  const groups = useWorkspaceGroupsListObservable();

  const [optimisticWorkspaceOrder, setOptimisticWorkspaceOrder] = useState<string[] | null>(null);
  const [optimisticGroupOrder, setOptimisticGroupOrder] = useState<string[] | null>(null);
  const pendingReorderReference = useRef<boolean>(false);

  // Track mouse globally as fallback when collision detection doesn't provide coordinates
  const mousePositionReference = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mousePositionReference.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const dragIntentReference = useRef<TDragIntent>(null);
  const dragOverIdReference = useRef<string | null>(null);
  const [dragState, setDragState] = useState<IDragContextValue>({ intent: null, overId: null });

  /**
   * Custom collision detection that handles workspace vs group header targeting:
   * - Ungrouped workspace drag: filter out group headers to prevent them from stealing targets.
   *   This ensures dropping on a workspace creates a new group rather than joining an existing one.
   * - Grouped workspace drag: include group headers so users can drop on their own group header
   *   to drag out of the group.
   */
  const customCollisionDetection = useCallback<CollisionDetection>((arguments_) => {
    const activeId = String(arguments_.active.id);
    const pointerCollisions = pointerWithin(arguments_);
    const collisions = (pointerCollisions.length > 0 ? pointerCollisions : closestCenter(arguments_))
      .filter((collision) => String(collision.id) !== activeId);
    const isDraggingWorkspace = !activeId.startsWith('group-');

    if (isDraggingWorkspace && collisions.length > 0) {
      // Use the workspace object attached to the active sortable item
      // to determine whether it is currently in a group.
      const activeWorkspace = (arguments_.active.data.current as { workspace?: IWorkspaceWithMetadata })?.workspace;
      const isInGroup = activeWorkspace?.groupId != null;

      // Allow group headers as targets when dragging a grouped workspace
      // so the user can drop on the group header to ungroup.
      if (isInGroup) {
        return collisions;
      }

      // When dragging an ungrouped workspace, prefer workspace targets over group headers
      // to avoid accidentally joining an existing group when trying to create a new one.
      const workspaceCollisions = collisions.filter((collision) => !String(collision.id).startsWith('group-'));
      if (workspaceCollisions.length > 0) {
        return workspaceCollisions;
      }
    }

    return collisions;
  }, []);

  const baseFilteredList = useMemo(() => {
    if (isMiniWindow) {
      return workspacesList.filter((workspace) => workspace.pageType !== PageType.add);
    }
    return workspacesList;
  }, [isMiniWindow, workspacesList]);

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

  useEffect(() => {
    if (pendingReorderReference.current) {
      pendingReorderReference.current = false;
      setOptimisticWorkspaceOrder(null);
      setOptimisticGroupOrder(null);
    }
  }, [workspacesList, groups]);

  const allDraggableIds = useMemo(() => {
    const ids: string[] = [];
    ungroupedWorkspaces.forEach(w => ids.push(w.id));
    orderedGroups.forEach(group => {
      ids.push(`group-${group.id}`);
      (groupedWorkspaces[group.id] || []).forEach(w => ids.push(w.id));
    });
    return ids;
  }, [ungroupedWorkspaces, orderedGroups, groupedWorkspaces]);

  const handleToggleCollapse = useCallback(async (groupId: string) => {
    const group = groups?.find(g => g.id === groupId);
    if (!group) return;

    await window.service.workspace.setGroup(groupId, {
      ...group,
      collapsed: !group.collapsed,
    });
  }, [groups]);

  const reorderWorkspaces = useCallback(async (activeId: string, overId: string, placement: 'before' | 'after' = 'before') => {
    const oldIndex = orderedWorkspaces.findIndex(w => w.id === activeId);
    const overIndex = orderedWorkspaces.findIndex(w => w.id === overId);

    if (oldIndex === -1 || overIndex === -1) return;

    const targetIndex = placement === 'after'
      ? oldIndex < overIndex ? overIndex : Math.min(overIndex + 1, orderedWorkspaces.length - 1)
      : oldIndex < overIndex
      ? Math.max(overIndex - 1, 0)
      : overIndex;

    if (targetIndex === oldIndex) return;

    const reorderedWorkspaces = arrayMove(orderedWorkspaces, oldIndex, targetIndex);
    setOptimisticWorkspaceOrder(reorderedWorkspaces.map(w => w.id));
    pendingReorderReference.current = true;

    const newWorkspaces: Record<string, IWorkspace> = {};
    reorderedWorkspaces.forEach((workspace, index) => {
      newWorkspaces[workspace.id] = { ...workspace, order: index };
    });

    await window.service.workspace.setWorkspaces(newWorkspaces);
  }, [orderedWorkspaces]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !active.data.current) {
      dragIntentReference.current = null;
      dragOverIdReference.current = null;
      setDragState({ intent: null, overId: null });
      return;
    }

    const activeType = (active.data.current as { type?: string }).type;
    const overType = (over.data.current as { type?: string }).type;

    // Workspace dragged over another workspace
    if (activeType === 'workspace' && overType === 'workspace') {
      const activeWorkspace = orderedWorkspaces.find(w => w.id === active.id);
      const overWorkspace = orderedWorkspaces.find(w => w.id === over.id);
      const canGroup = isGroupableWorkspace(activeWorkspace) && isGroupableWorkspace(overWorkspace);
      const overRect = over.rect;
      const activeRect = active.rect.current.translated;
      const intent = overRect.height > 0
        ? getWorkspaceZoneIntent({
          activeRect,
          canGroup,
          overRect,
          pointerY: mousePositionReference.current?.y,
        })
        : canGroup
        ? 'group'
        : 'reorder-before';

      dragIntentReference.current = intent;
      dragOverIdReference.current = String(over.id);
      setDragState({ intent, overId: String(over.id) });
    } else if (activeType === 'group' && overType === 'group') {
      dragIntentReference.current = 'reorder-before';
      dragOverIdReference.current = String(over.id);
      setDragState({ intent: 'reorder-before', overId: String(over.id) });
    } else if (activeType === 'workspace' && overType === 'group') {
      const activeWorkspace = orderedWorkspaces.find(w => w.id === active.id);
      const overGroupId = String(over.id).replace('group-', '');
      // If workspace is already in this group, show "ungroup" intent
      // Otherwise show "group" intent
      if (activeWorkspace?.groupId === overGroupId) {
        dragIntentReference.current = 'ungroup';
      } else {
        dragIntentReference.current = 'group';
      }
      dragOverIdReference.current = String(over.id);
      setDragState({ intent: dragIntentReference.current, overId: String(over.id) });
    } else {
      dragIntentReference.current = null;
      dragOverIdReference.current = null;
      setDragState({ intent: null, overId: null });
    }
  }, [orderedWorkspaces]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const currentIntent = dragIntentReference.current;
    const currentOverId = dragOverIdReference.current;

    dragIntentReference.current = null;
    dragOverIdReference.current = null;
    setDragState({ intent: null, overId: null });

    const activeId = String(active.id);
    const activeData = active.data.current;
    const resolvedOverId = over && active.id !== over.id
      ? String(over.id)
      : currentOverId && currentOverId !== activeId
      ? currentOverId
      : over
      ? String(over.id)
      : null;

    if (!resolvedOverId || activeId === resolvedOverId) return;

    const overId = resolvedOverId;
    const resolvedOverType = overId.startsWith('group-') ? 'group' : 'workspace';

    // === Case: Group dropped on group → reorder groups ===
    if (activeId.startsWith('group-') && overId.startsWith('group-')) {
      const activeGroupId = activeId.replace('group-', '');
      const overGroupId = overId.replace('group-', '');

      const oldIndex = orderedGroups.findIndex(g => g.id === activeGroupId);
      const newIndex = orderedGroups.findIndex(g => g.id === overGroupId);

      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedGroups = arrayMove(orderedGroups, oldIndex, newIndex);
      setOptimisticGroupOrder(reorderedGroups.map(g => g.id));
      pendingReorderReference.current = true;

      await Promise.all(
        reorderedGroups.map((group, index) => window.service.workspace.setGroup(group.id, { ...group, order: index })),
      );
      return;
    }

    // === Case: Group dropped on anything else → ignore ===
    if (activeId.startsWith('group-')) {
      return;
    }

    // === Case: Workspace dropped on group header ===
    if (activeData?.type === 'workspace' && overId.startsWith('group-')) {
      const groupId = overId.replace('group-', '');
      const activeWorkspace = orderedWorkspaces.find(w => w.id === activeId);

      if (activeWorkspace?.groupId === groupId) {
        // Already in this group → remove from group
        await window.service.workspace.moveWorkspaceToGroup(activeId, null);
      } else {
        // Move to group
        await window.service.workspace.moveWorkspaceToGroup(activeId, groupId);
      }
      return;
    }

    // === Case: Workspace dropped on another workspace ===
    if (activeData?.type === 'workspace' && resolvedOverType === 'workspace') {
      const activeWorkspace = orderedWorkspaces.find(w => w.id === activeId);
      const overWorkspace = orderedWorkspaces.find(w => w.id === overId);

      if (!activeWorkspace || !overWorkspace) return;

      const resolvedIntent = over && resolvedOverType === 'workspace'
        ? getWorkspaceZoneIntent({
          activeRect: active.rect.current.translated,
          canGroup: isGroupableWorkspace(activeWorkspace) && isGroupableWorkspace(overWorkspace),
          overRect: over.rect,
          pointerY: mousePositionReference.current?.y,
        })
        : currentIntent;

      // Same group → always reorder
      if (activeWorkspace.groupId && overWorkspace.groupId && activeWorkspace.groupId === overWorkspace.groupId) {
        await reorderWorkspaces(activeId, overId, resolvedIntent === 'reorder-after' ? 'after' : 'before');
        return;
      }

      // Different contexts with 'group' intent
      if (resolvedIntent === 'group') {
        // From grouped to ungrouped → remove from group
        if (activeWorkspace.groupId && !overWorkspace.groupId) {
          await window.service.workspace.moveWorkspaceToGroup(activeId, null);
          return;
        }

        // From ungrouped to grouped → join target's group
        if (!activeWorkspace.groupId && overWorkspace.groupId) {
          await window.service.workspace.moveWorkspaceToGroup(activeId, overWorkspace.groupId);
          return;
        }

        // Between different groups → move to target's group
        if (activeWorkspace.groupId && overWorkspace.groupId && activeWorkspace.groupId !== overWorkspace.groupId) {
          await window.service.workspace.moveWorkspaceToGroup(activeId, overWorkspace.groupId);
          return;
        }

        // Both ungrouped → create new group
        if (!activeWorkspace.groupId && !overWorkspace.groupId) {
          const newGroupId = `group-${Date.now()}`;
          const newGroup: IWorkspaceGroup = {
            id: newGroupId,
            name: t('WorkspaceGroup.DefaultGroupName', { number: orderedGroups.length + 1 }),
            collapsed: false,
            order: orderedGroups.length,
          };

          await window.service.workspace.setGroup(newGroupId, newGroup);
          await window.service.workspace.moveWorkspaceToGroup(activeId, newGroupId);
          await window.service.workspace.moveWorkspaceToGroup(overId, newGroupId);
          return;
        }
      }

      await reorderWorkspaces(activeId, overId, resolvedIntent === 'reorder-after' ? 'after' : 'before');
      return;
    }

    // === Case: Workspace dropped on empty space ===
    if (activeData?.type === 'workspace' && !over) {
      const activeWorkspace = orderedWorkspaces.find(w => w.id === activeId);

      if (activeWorkspace?.groupId) {
        await window.service.workspace.moveWorkspaceToGroup(activeId, null);
        return;
      }

      await reorderWorkspaces(activeId, overId);
      return;
    }
  }, [orderedWorkspaces, orderedGroups, reorderWorkspaces]);

  return (
    <DragContext.Provider value={dragState}>
      <DndContext
        sensors={dndSensors}
        collisionDetection={customCollisionDetection}
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

          {/* Groups with their workspaces — flat structure in SortableContext */}
          {orderedGroups.map(group => {
            const workspacesInGroup = groupedWorkspaces[group.id] || [];
            if (workspacesInGroup.length === 0) return null;

            return (
              <React.Fragment key={group.id}>
                <SortableGroupHeader
                  group={group}
                  onToggleCollapse={handleToggleCollapse}
                />
                <Collapse in={!group.collapsed} timeout='auto' unmountOnExit>
                  <GroupContent>
                    {workspacesInGroup.map((workspace, index) => (
                      <SortableWorkspaceSelectorButton
                        key={`item-${workspace.id}`}
                        index={index}
                        workspace={workspace}
                        showSidebarTexts={showSideBarText}
                        showSideBarIcon={showSideBarIcon}
                      />
                    ))}
                  </GroupContent>
                </Collapse>
              </React.Fragment>
            );
          })}
        </SortableContext>
      </DndContext>
    </DragContext.Provider>
  );
}
