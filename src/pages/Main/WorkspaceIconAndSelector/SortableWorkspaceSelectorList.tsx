import {
  closestCorners,
  CollisionDetection,
  DndContext,
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Avatar, Collapse, styled, Tooltip } from '@mui/material';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageType } from '@/constants/pageTypes';
import { getBuildInPageIcon } from '@/pages/Main/WorkspaceIconAndSelector/getBuildInPageIcon';
import { getBuildInPageName } from '@/pages/Main/WorkspaceIconAndSelector/getBuildInPageName';
import { PreferenceSections } from '@services/preferences/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import { useWorkspaceGroupsListObservable } from '@services/workspaces/hooks';
import { isWikiWorkspace, IWorkspace, IWorkspaceGroup, IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { SortableWorkspaceSelectorButton } from './SortableWorkspaceSelectorButton';
import { WorkspaceSelectorBase } from './WorkspaceSelectorBase';

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
  activeId: string | null;
}

interface IDragState extends IDragContextValue {
  projectedWorkspaceOrder: string[] | null;
  projectedGroupOrder: string[] | null;
}

const initialDragState: IDragState = {
  intent: null,
  overId: null,
  activeId: null,
  projectedWorkspaceOrder: null,
  projectedGroupOrder: null,
};

const DragContext = React.createContext<IDragContextValue>({ intent: null, overId: null, activeId: null });

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
  const beforeBoundary = overRect.height / 4;
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

function getReorderTargetIndex({
  listLength,
  oldIndex,
  overIndex,
  placement,
}: {
  listLength: number;
  oldIndex: number;
  overIndex: number;
  placement: 'before' | 'after';
}): number {
  if (placement === 'after') {
    return oldIndex < overIndex ? overIndex : Math.min(overIndex + 1, listLength - 1);
  }

  return oldIndex < overIndex ? Math.max(overIndex - 1, 0) : overIndex;
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
        distance: 8,
      },
    }),
  );

  const isMiniWindow = window.meta().windowName === WindowNames.tidgiMiniWindow;
  const groups = useWorkspaceGroupsListObservable();

  const pendingReorderReference = useRef<boolean>(false);
  const dragStateReference = useRef<IDragState>(initialDragState);

  // Drag preview and drop behavior must resolve from the same projected state.
  const [dragState, setDragState] = useState<IDragState>(initialDragState);

  const areProjectedIdsEqual = useCallback((left: string[] | null, right: string[] | null): boolean => {
    if (left === right) {
      return true;
    }

    if (left === null || right === null || left.length !== right.length) {
      return false;
    }

    return left.every((id, index) => id === right[index]);
  }, []);

  const isDragStateEqual = useCallback((left: IDragState, right: IDragState): boolean => {
    return left.intent === right.intent &&
      left.overId === right.overId &&
      left.activeId === right.activeId &&
      areProjectedIdsEqual(left.projectedWorkspaceOrder, right.projectedWorkspaceOrder) &&
      areProjectedIdsEqual(left.projectedGroupOrder, right.projectedGroupOrder);
  }, [areProjectedIdsEqual]);

  const applyDragState = useCallback((nextState: IDragState | ((previousState: IDragState) => IDragState)) => {
    if (typeof nextState === 'function') {
      setDragState(previousState => {
        const resolvedState = nextState(previousState);

        if (isDragStateEqual(previousState, resolvedState)) {
          return previousState;
        }

        dragStateReference.current = resolvedState;
        return resolvedState;
      });
      return;
    }

    if (isDragStateEqual(dragStateReference.current, nextState)) {
      return;
    }

    dragStateReference.current = nextState;
    setDragState(nextState);
  }, [isDragStateEqual]);

  /**
   * Custom collision detection that handles workspace vs group header targeting:
   * - Ungrouped workspace drag: filter out group headers to prevent them from stealing targets.
   *   This ensures dropping on a workspace creates a new group rather than joining an existing one.
   * - Grouped workspace drag: include group headers so users can drop on their own group header
   *   to drag out of the group.
   *
   * The active workspace's current group decides whether a header can win the collision race.
   * When the pointer overlaps its own group header, that header must outrank nearby workspaces so
   * the drop result matches the ungroup affordance the user is aiming at.
   */
  /**
   * Custom collision detection that handles workspace vs group header targeting:
   * - Ungrouped workspace drag: filter out group headers to prevent them from stealing targets.
   *   This ensures dropping on a workspace creates a new group rather than joining an existing one.
   * - Grouped workspace drag: include group headers so users can drop on their own group header
   *   to drag out of the group.
   *
   * The active workspace's current group decides whether a header can win the collision race.
   * When the pointer overlaps its own group header, that header must outrank nearby workspaces so
   * the drop result matches the ungroup affordance the user is aiming at.
   *
   * Note: MeasuringStrategy.Always ensures droppable rects are always fresh, eliminating the need
   * for manual DOM rect fallbacks.
   */
  const customCollisionDetection = useCallback<CollisionDetection>((arguments_) => {
    const activeId = String(arguments_.active.id);
    const pointerCollisions = pointerWithin(arguments_).filter((collision) => String(collision.id) !== activeId);
    const collisions = pointerCollisions.length > 0
      ? pointerCollisions
      : closestCorners(arguments_).filter((collision) => String(collision.id) !== activeId);
    const isDraggingWorkspace = !activeId.startsWith('group-');

    if (isDraggingWorkspace && collisions.length > 0) {
      const activeWorkspace = (arguments_.active.data.current as { workspace?: IWorkspaceWithMetadata } | undefined)?.workspace;
      const ownGroupHeaderId = activeWorkspace?.groupId ? `group-${activeWorkspace.groupId}` : null;

      if (ownGroupHeaderId) {
        const ownGroupHeaderCollision = collisions.find((collision) => String(collision.id) === ownGroupHeaderId);

        if (ownGroupHeaderCollision) {
          return [
            ownGroupHeaderCollision,
            ...collisions.filter((collision) => String(collision.id) !== ownGroupHeaderId),
          ];
        }
      }

      if (activeWorkspace?.groupId) {
        return collisions;
      }

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

  const canonicalWorkspaces = useMemo(() => {
    return [...baseFilteredList].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [baseFilteredList]);

  const displayedWorkspaces = useMemo(() => {
    if (dragState.projectedWorkspaceOrder === null) {
      return canonicalWorkspaces;
    }
    const orderMap = new Map(dragState.projectedWorkspaceOrder.map((id, index) => [id, index]));
    return [...canonicalWorkspaces].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? a.order ?? 0;
      const orderB = orderMap.get(b.id) ?? b.order ?? 0;
      return orderA - orderB;
    });
  }, [canonicalWorkspaces, dragState.projectedWorkspaceOrder]);

  const canonicalGroups = useMemo(() => {
    if (!groups) return [];
    return [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [groups]);

  const displayedGroups = useMemo(() => {
    if (dragState.projectedGroupOrder === null) {
      return canonicalGroups;
    }
    const orderMap = new Map(dragState.projectedGroupOrder.map((id, index) => [id, index]));
    return [...canonicalGroups].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? a.order ?? 0;
      const orderB = orderMap.get(b.id) ?? b.order ?? 0;
      return orderA - orderB;
    });
  }, [canonicalGroups, dragState.projectedGroupOrder]);

  const { ungroupedWorkspaces, groupedWorkspaces } = useMemo(() => {
    const ungrouped: IWorkspaceWithMetadata[] = [];
    const grouped: Record<string, IWorkspaceWithMetadata[]> = {};

    displayedWorkspaces.forEach(workspace => {
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
  }, [displayedWorkspaces]);

  useEffect(() => {
    if (pendingReorderReference.current) {
      pendingReorderReference.current = false;
      applyDragState(initialDragState);
    }
  }, [applyDragState, workspacesList, groups]);

  const allDraggableIds = useMemo(() => {
    const ids: string[] = [];
    ungroupedWorkspaces.forEach(w => ids.push(w.id));
    displayedGroups.forEach(group => {
      ids.push(`group-${group.id}`);
      (groupedWorkspaces[group.id] || []).forEach(w => ids.push(w.id));
    });
    return ids;
  }, [ungroupedWorkspaces, displayedGroups, groupedWorkspaces]);

  const handleToggleCollapse = useCallback(async (groupId: string) => {
    const group = groups?.find(g => g.id === groupId);
    if (!group) return;

    await window.service.workspace.setGroup(groupId, {
      ...group,
      collapsed: !group.collapsed,
    });
  }, [groups]);

  const computeWorkspaceProjection = useCallback((activeId: string, overId: string, intent: TDragIntent): string[] | null => {
    if (intent !== 'reorder-before' && intent !== 'reorder-after') {
      return null;
    }

    const oldIndex = canonicalWorkspaces.findIndex(workspace => workspace.id === activeId);
    const overIndex = canonicalWorkspaces.findIndex(workspace => workspace.id === overId);

    if (oldIndex === -1 || overIndex === -1) {
      return null;
    }

    const targetIndex = getReorderTargetIndex({
      listLength: canonicalWorkspaces.length,
      oldIndex,
      overIndex,
      placement: intent === 'reorder-after' ? 'after' : 'before',
    });

    return arrayMove(canonicalWorkspaces, oldIndex, targetIndex).map(workspace => workspace.id);
  }, [canonicalWorkspaces]);

  const resetDragState = useCallback(() => {
    applyDragState(initialDragState);
  }, [applyDragState]);

  const reorderWorkspaces = useCallback(async (activeId: string, overId: string, placement: 'before' | 'after' = 'before') => {
    const oldIndex = canonicalWorkspaces.findIndex(w => w.id === activeId);
    const overIndex = canonicalWorkspaces.findIndex(w => w.id === overId);

    if (oldIndex === -1 || overIndex === -1) return;

    const targetIndex = getReorderTargetIndex({
      listLength: canonicalWorkspaces.length,
      oldIndex,
      overIndex,
      placement,
    });

    if (targetIndex === oldIndex) return;

    const reorderedWorkspaces = arrayMove(canonicalWorkspaces, oldIndex, targetIndex);
    pendingReorderReference.current = true;

    const newWorkspaces: Record<string, IWorkspace> = {};
    reorderedWorkspaces.forEach((workspace, index) => {
      newWorkspaces[workspace.id] = { ...workspace, order: index };
    });

    await window.service.workspace.setWorkspaces(newWorkspaces);
  }, [canonicalWorkspaces]);

  const deriveDragState = useCallback((event: Pick<DragMoveEvent, 'active' | 'over' | 'delta' | 'collisions'>): IDragState => {
    const { active, over } = event;
    const activeId = String(active.id);
    const translatedRect = active.rect.current.translated;
    const initialRect = active.rect.current.initial;
    const pointerY = initialRect
      ? initialRect.top + initialRect.height / 2 + event.delta.y
      : translatedRect
      ? translatedRect.top + translatedRect.height / 2
      : undefined;
    const overData = over?.data.current as { type?: string } | undefined;
    const effectiveOverId = over ? String(over.id) : null;
    const effectiveOverType = overData?.type;

    if (!effectiveOverId || !active.data.current) {
      return {
        ...dragStateReference.current,
        activeId,
        overId: null,
        intent: null,
        projectedWorkspaceOrder: null,
        projectedGroupOrder: null,
      };
    }

    const activeType = (active.data.current as { type?: string }).type;
    const overType = effectiveOverType;

    if (activeType === 'workspace' && overType === 'workspace') {
      const activeWorkspace = canonicalWorkspaces.find(workspace => workspace.id === activeId);
      const overId = effectiveOverId;
      const overWorkspace = canonicalWorkspaces.find(workspace => workspace.id === overId);
      const activeRect = active.rect.current.translated;
      const overRect = over?.rect;

      if (!overRect) {
        return {
          ...dragStateReference.current,
          activeId,
          overId,
          intent: null,
          projectedWorkspaceOrder: null,
          projectedGroupOrder: null,
        };
      }

      const isSameGroup = activeWorkspace?.groupId && overWorkspace?.groupId && activeWorkspace.groupId === overWorkspace.groupId;
      const intent = overRect.height > 0
        ? getWorkspaceZoneIntent({
          activeRect,
          canGroup: !isSameGroup && isGroupableWorkspace(activeWorkspace) && isGroupableWorkspace(overWorkspace),
          overRect,
          pointerY,
        })
        : 'reorder-before';

      return {
        intent,
        overId,
        activeId,
        projectedWorkspaceOrder: intent === 'reorder-before' || intent === 'reorder-after'
          ? computeWorkspaceProjection(activeId, overId, intent)
          : null,
        projectedGroupOrder: null,
      };
    }

    if (activeType === 'group' && overType === 'group') {
      const overId = effectiveOverId;
      const activeGroupId = activeId.replace('group-', '');
      const overGroupId = overId.replace('group-', '');
      const oldIndex = canonicalGroups.findIndex(group => group.id === activeGroupId);
      const overIndex = canonicalGroups.findIndex(group => group.id === overGroupId);

      return {
        intent: 'reorder-before',
        overId,
        activeId,
        projectedWorkspaceOrder: null,
        projectedGroupOrder: oldIndex === -1 || overIndex === -1
          ? null
          : arrayMove(canonicalGroups, oldIndex, overIndex).map(group => group.id),
      };
    }

    if (activeType === 'workspace' && overType === 'group') {
      const overId = effectiveOverId;
      const activeWorkspace = canonicalWorkspaces.find(workspace => workspace.id === activeId);
      const overGroupId = overId.replace('group-', '');
      const intent = activeWorkspace?.groupId === overGroupId ? 'ungroup' : 'group';

      return {
        intent,
        overId,
        activeId,
        projectedWorkspaceOrder: intent === 'ungroup'
          ? canonicalWorkspaces.map(workspace => workspace.id)
          : null,
        projectedGroupOrder: null,
      };
    }

    return {
      ...dragStateReference.current,
      activeId,
      overId: null,
      intent: null,
      projectedWorkspaceOrder: null,
      projectedGroupOrder: null,
    };
  }, [canonicalGroups, canonicalWorkspaces, computeWorkspaceProjection]);

  const updateDragStateFromEvent = useCallback((event: DragMoveEvent | DragOverEvent) => {
    applyDragState(deriveDragState(event));
  }, [applyDragState, deriveDragState]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    updateDragStateFromEvent(event);
  }, [updateDragStateFromEvent]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    updateDragStateFromEvent(event);
  }, [updateDragStateFromEvent]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    applyDragState(previous => ({ ...previous, activeId: String(event.active.id) }));
  }, [applyDragState]);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    resetDragState();
  }, [resetDragState]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active } = event;
    const activeId = String(active.id);
    const previewDragState = dragStateReference.current;
    const shouldUsePreviewDragState = previewDragState.activeId === activeId && (
      previewDragState.overId !== null ||
      previewDragState.intent !== null ||
      previewDragState.projectedWorkspaceOrder !== null ||
      previewDragState.projectedGroupOrder !== null
    );
    const currentDragState = shouldUsePreviewDragState ? previewDragState : deriveDragState(event);
    dragStateReference.current = currentDragState;
    resetDragState();

    const { intent: currentIntent, overId: currentOverId } = currentDragState;
    if (!currentIntent || !currentOverId || activeId === currentOverId) return;

    const overId = currentOverId;
    const resolvedOverType = overId.startsWith('group-') ? 'group' : 'workspace';

    // === Case: Group dropped on group → reorder groups ===
    if (activeId.startsWith('group-') && overId.startsWith('group-')) {
      const activeGroupId = activeId.replace('group-', '');
      const overGroupId = overId.replace('group-', '');

      const oldIndex = canonicalGroups.findIndex(g => g.id === activeGroupId);
      const newIndex = canonicalGroups.findIndex(g => g.id === overGroupId);

      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedGroups = arrayMove(canonicalGroups, oldIndex, newIndex);
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

    const activeData = active.data.current;

    // === Case: Workspace dropped on group header ===
    if (activeData?.type === 'workspace' && overId.startsWith('group-')) {
      const groupId = overId.replace('group-', '');

      if (currentIntent === 'ungroup') {
        await window.service.workspace.moveWorkspaceToGroup(activeId, null);
      } else {
        await window.service.workspace.moveWorkspaceToGroup(activeId, groupId);
      }
      return;
    }

    // === Case: Workspace dropped on another workspace ===
    if (activeData?.type === 'workspace' && resolvedOverType === 'workspace') {
      const activeWorkspace = canonicalWorkspaces.find(w => w.id === activeId);
      const overWorkspace = canonicalWorkspaces.find(w => w.id === overId);

      if (!activeWorkspace || !overWorkspace) return;

      // Same group → always reorder
      if (activeWorkspace.groupId && overWorkspace.groupId && activeWorkspace.groupId === overWorkspace.groupId) {
        await reorderWorkspaces(activeId, overId, currentIntent === 'reorder-after' ? 'after' : 'before');
        return;
      }

      // Different contexts with 'group' intent
      if (currentIntent === 'group') {
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
            name: t('WorkspaceGroup.DefaultGroupName', { number: canonicalGroups.length + 1 }),
            collapsed: false,
            order: canonicalGroups.length,
          };

          await window.service.workspace.setGroup(newGroupId, newGroup);
          await window.service.workspace.moveWorkspaceToGroup(activeId, newGroupId);
          await window.service.workspace.moveWorkspaceToGroup(overId, newGroupId);
          return;
        }
      }

      await reorderWorkspaces(activeId, overId, currentIntent === 'reorder-after' ? 'after' : 'before');
      return;
    }
  }, [canonicalGroups, canonicalWorkspaces, deriveDragState, reorderWorkspaces, resetDragState, t]);

  const activeWorkspace = dragState.activeId && !dragState.activeId.startsWith('group-')
    ? canonicalWorkspaces.find(w => w.id === dragState.activeId)
    : undefined;
  const activeGroup = dragState.activeId?.startsWith('group-')
    ? canonicalGroups.find(g => `group-${g.id}` === dragState.activeId)
    : undefined;

  return (
    <DragContext.Provider value={dragState}>
      <DndContext
        sensors={dndSensors}
        collisionDetection={customCollisionDetection}
        modifiers={[restrictToVerticalAxis]}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
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
          {displayedGroups.map(group => {
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
        <DragOverlay dropAnimation={null}>
          {activeWorkspace && (() => {
            const isWiki = isWikiWorkspace(activeWorkspace);
            const displayName = activeWorkspace.pageType
              ? getBuildInPageName(activeWorkspace.pageType, t)
              : activeWorkspace.name;
            const customIcon = activeWorkspace.pageType
              ? getBuildInPageIcon(activeWorkspace.pageType)
              : undefined;
            return (
              <WorkspaceSelectorBase
                id={activeWorkspace.id}
                active={activeWorkspace.active}
                workspaceName={displayName}
                picturePath={activeWorkspace.picturePath}
                customIcon={customIcon}
                showSideBarIcon={showSideBarIcon}
                showSidebarTexts={showSideBarText}
                pageType={activeWorkspace.pageType || undefined}
                hibernated={isWiki ? activeWorkspace.hibernated : false}
                transparentBackground={isWiki ? activeWorkspace.transparentBackground : false}
                index={0}
              />
            );
          })()}
          {activeGroup && (
            <GroupHeader $isDragging style={{ cursor: 'grabbing' }}>
              {activeGroup.collapsed ? <ChevronRightIcon fontSize='small' /> : <ExpandMoreIcon fontSize='small' />}
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
                {getGroupInitial(activeGroup.name)}
              </Avatar>
              <Tooltip title={activeGroup.name} placement='top'>
                <GroupTitle>{activeGroup.name}</GroupTitle>
              </Tooltip>
            </GroupHeader>
          )}
        </DragOverlay>
      </DndContext>
    </DragContext.Provider>
  );
}
