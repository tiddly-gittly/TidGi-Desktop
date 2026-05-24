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

interface IInterleavedSidebarItemWorkspace {
  type: 'workspace';
  workspace: IWorkspaceWithMetadata;
  order: number;
}

interface IInterleavedSidebarItemGroup {
  type: 'group';
  group: IWorkspaceGroup;
  workspaces: IWorkspaceWithMetadata[];
  order: number;
}

type TInterleavedSidebarItem = IInterleavedSidebarItemWorkspace | IInterleavedSidebarItemGroup;

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

function isSidebarGroupItem(item: TInterleavedSidebarItem): item is IInterleavedSidebarItemGroup {
  return item.type === 'group';
}

function getSidebarItemId(item: TInterleavedSidebarItem): string {
  return isSidebarGroupItem(item) ? `group-${item.group.id}` : item.workspace.id;
}

function getReorderIntentFromPointer({
  pointerY,
  rect,
}: {
  pointerY: number;
  rect: { top: number; height: number };
}): Exclude<TDragIntent, 'group' | 'ungroup' | null> {
  const relativeY = Math.min(Math.max(pointerY - rect.top, 0), rect.height);
  const beforeBoundary = rect.height / 3;
  const afterBoundary = rect.height - beforeBoundary;

  if (relativeY <= beforeBoundary) {
    return 'reorder-before';
  }

  if (relativeY >= afterBoundary) {
    return 'reorder-after';
  }

  return relativeY < rect.height / 2 ? 'reorder-before' : 'reorder-after';
}

// ─── SortableGroupHeader ─────────────────────────────────────────────

function SortableGroupHeader({ group, onToggleCollapse }: SortableGroupHeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  // Keep data reference stable; only groupId is needed by collision detection.
  const sortableData = useMemo(() => ({ type: 'group' as const, groupId: group.id }), [group.id]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group-${group.id}`,
    data: sortableData,
  });

  const dragContext = useDragContext();
  const isDragOverTarget = dragContext.overId === `group-${group.id}`;
  const dragIntent = isDragOverTarget ? dragContext.intent : null;
  const isAnyDragActive = dragContext.activeId !== null;

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
        if (isAnyDragActive) {
          return;
        }

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

// ─── DragOverlay Sub-components ──────────────────────────────────────

const DragOverlayWorkspaceItem = React.memo(function DragOverlayWorkspaceItem({
  workspace,
  showSideBarIcon,
  showSideBarText,
}: {
  workspace: IWorkspaceWithMetadata;
  showSideBarIcon: boolean;
  showSideBarText: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const isWiki = isWikiWorkspace(workspace);
  const displayName = workspace.pageType
    ? getBuildInPageName(workspace.pageType, t)
    : workspace.name;
  const customIcon = workspace.pageType
    ? getBuildInPageIcon(workspace.pageType)
    : undefined;
  return (
    <WorkspaceSelectorBase
      id={workspace.id}
      active={workspace.active}
      workspaceName={displayName}
      picturePath={workspace.picturePath}
      customIcon={customIcon}
      showSideBarIcon={showSideBarIcon}
      showSidebarTexts={showSideBarText}
      pageType={workspace.pageType || undefined}
      hibernated={isWiki ? workspace.hibernated : false}
      transparentBackground={isWiki ? workspace.transparentBackground : false}
      index={0}
    />
  );
});

const DragOverlayGroupHeaderItem = React.memo(function DragOverlayGroupHeaderItem({ group }: { group: IWorkspaceGroup }): React.JSX.Element {
  return (
    <GroupHeader $isDragging style={{ cursor: 'grabbing' }}>
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
});

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
  const lastResolvedDragStateReference = useRef<IDragState>(initialDragState);
  const dragStateTimeoutReference = useRef<number | null>(null);
  const allDraggableIdsReference = useRef<string[]>([]);

  useEffect(() => () => {
    if (dragStateTimeoutReference.current !== null) {
      clearTimeout(dragStateTimeoutReference.current);
      dragStateTimeoutReference.current = null;
    }
  }, []);

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
   *
   * Note: MeasuringStrategy.Always ensures droppable rects are always fresh, eliminating the need
   * for manual DOM rect fallbacks.
   */
  // Track the actual pointer Y during drag for accurate zone calculations.
  // dnd-kit's event.delta is scrollAdjustedTranslate (modified by modifiers
  // and scroll), not the raw pointer position. We use a capture-phase listener
  // to ensure pointerYReference is updated BEFORE dnd-kit's onDragMove fires, so
  // deriveDragState always reads the current pointer position.
  const pointerYReference = useRef<number | undefined>(undefined);
  useEffect(() => {
    const handler = (event: PointerEvent) => {
      pointerYReference.current = event.clientY;
    };
    window.addEventListener('pointermove', handler, { capture: true });
    return () => {
      window.removeEventListener('pointermove', handler, { capture: true });
    };
  }, []);

  const customCollisionDetection = useCallback<CollisionDetection>((arguments_) => {
    const activeId = String(arguments_.active.id);
    const pointerCollisions = pointerWithin(arguments_).filter((collision) => String(collision.id) !== activeId);
    const collisions = pointerCollisions.length > 0
      ? pointerCollisions
      : closestCorners(arguments_).filter((collision) => String(collision.id) !== activeId);
    const isDraggingWorkspace = !activeId.startsWith('group-');

    let result = collisions;

    if (isDraggingWorkspace && collisions.length > 0) {
      const activeGroupId = (arguments_.active.data.current as { groupId?: string | null } | undefined)?.groupId;
      const ownGroupHeaderId = activeGroupId ? `group-${activeGroupId}` : null;
      const workspaceCollisions = collisions.filter((collision) => !String(collision.id).startsWith('group-'));

      // When the pointer overlaps its own group header, that header must outrank
      // nearby workspaces so the drop result matches the ungroup affordance.
      if (ownGroupHeaderId) {
        const ownGroupHeaderCollision = collisions.find((collision) => String(collision.id) === ownGroupHeaderId);

        if (ownGroupHeaderCollision) {
          result = [
            ownGroupHeaderCollision,
            ...collisions.filter((collision) => String(collision.id) !== ownGroupHeaderId),
          ];
        } else {
          // Pointer is not over own header; exclude group headers so the drop
          // lands on a workspace instead.
          result = workspaceCollisions.length > 0 ? workspaceCollisions : collisions;
        }
      } else {
        // Ungrouped workspace drag: filter out group headers entirely.
        result = workspaceCollisions.length > 0 ? workspaceCollisions : collisions;
      }
    } else if (!isDraggingWorkspace && collisions.length > 0) {
      // Group headers now participate in the same mixed ordering space as
      // ungrouped workspaces, so group drags must be allowed to collide with
      // both groups and workspaces.
      result = collisions;
    }

    return result;
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

  // Visual reordering during drag is disabled to keep DOM positions stable.
  // This prevents drop zones from shifting under the pointer while the user
  // is dragging, which caused intent mis-detection in E2E tests and real use.
  // Drag intent highlights (reorder-before/after, group) still provide feedback.
  const displayedWorkspaces = canonicalWorkspaces;

  const canonicalGroups = useMemo(() => {
    if (!groups) return [];
    return [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [groups]);

  const displayedGroups = canonicalGroups;

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

  const interleavedSidebarItems = useMemo<TInterleavedSidebarItem[]>(() => {
    const items: TInterleavedSidebarItem[] = [
      ...ungroupedWorkspaces.map(workspace => ({
        type: 'workspace' as const,
        workspace,
        order: workspace.order ?? 0,
      })),
      ...displayedGroups.map(group => ({
        type: 'group' as const,
        group,
        workspaces: groupedWorkspaces[group.id] || [],
        order: group.order ?? 0,
      })),
    ];

    return items.sort((left, right) => left.order - right.order);
  }, [displayedGroups, groupedWorkspaces, ungroupedWorkspaces]);

  useEffect(() => {
    if (pendingReorderReference.current) {
      pendingReorderReference.current = false;
      applyDragState(initialDragState);
    }
  }, [applyDragState, workspacesList, groups]);

  // Keep items stable during drag by deriving from canonical order only.
  // Visual reordering is handled by displayedWorkspaces/displayedGroups;
  // SortableContext items should not change during drag to avoid dnd-kit
  // re-registration loops. See https://github.com/clauderic/dnd-kit/issues/900
  const allDraggableIds = useMemo(() => {
    if (dragState.activeId !== null) {
      return allDraggableIdsReference.current;
    }
    const ids: string[] = [];

    interleavedSidebarItems.forEach(item => {
      ids.push(getSidebarItemId(item));
      if (isSidebarGroupItem(item) && !item.group.collapsed) {
        item.workspaces.forEach(workspace => ids.push(workspace.id));
      }
    });

    allDraggableIdsReference.current = ids;
    return ids;
  }, [interleavedSidebarItems, dragState.activeId]);

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

  const persistInterleavedSidebarOrder = useCallback(async (nextItems: TInterleavedSidebarItem[]) => {
    const nextWorkspaces: Record<string, IWorkspace> = {};
    const nextGroups: IWorkspaceGroup[] = [];
    const previousWorkspaceOrders: Record<string, number> = {};

    nextItems.forEach((item, index) => {
      if (isSidebarGroupItem(item)) {
        nextGroups.push({ ...item.group, order: index });
        return;
      }

      previousWorkspaceOrders[item.workspace.id] = item.workspace.order ?? 0;
      nextWorkspaces[item.workspace.id] = {
        ...item.workspace,
        order: index,
      };
    });

    pendingReorderReference.current = true;

    try {
      if (Object.keys(nextWorkspaces).length > 0) {
        await window.service.workspace.setWorkspaces(nextWorkspaces);
      }

      await Promise.all(nextGroups.map(group => window.service.workspace.setGroup(group.id, group)));
    } catch (error) {
      // Rollback workspace orders if group updates fail
      const rollbackWorkspaces: Record<string, IWorkspace> = {};
      Object.keys(previousWorkspaceOrders).forEach((id) => {
        rollbackWorkspaces[id] = { ...nextWorkspaces[id], order: previousWorkspaceOrders[id] };
      });
      if (Object.keys(rollbackWorkspaces).length > 0) {
        await window.service.workspace.setWorkspaces(rollbackWorkspaces).catch(() => {});
      }
      throw error;
    }
  }, []);

  const clearDragStateTimeout = useCallback(() => {
    if (dragStateTimeoutReference.current !== null) {
      clearTimeout(dragStateTimeoutReference.current);
      dragStateTimeoutReference.current = null;
    }
  }, []);

  const resetDragState = useCallback(() => {
    clearDragStateTimeout();
    lastResolvedDragStateReference.current = initialDragState;
    applyDragState(initialDragState);
  }, [applyDragState, clearDragStateTimeout]);

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

  const reorderSidebarItems = useCallback(async (activeId: string, overId: string, placement: 'before' | 'after' | 'direct' = 'before') => {
    const oldIndex = interleavedSidebarItems.findIndex(item => getSidebarItemId(item) === activeId);
    const overIndex = interleavedSidebarItems.findIndex(item => getSidebarItemId(item) === overId);

    if (oldIndex === -1 || overIndex === -1) {
      return;
    }

    let targetIndex: number;
    if (placement === 'direct') {
      targetIndex = overIndex;
    } else {
      targetIndex = getReorderTargetIndex({
        listLength: interleavedSidebarItems.length,
        oldIndex,
        overIndex,
        placement,
      });
    }

    if (targetIndex === oldIndex) {
      return;
    }

    const reorderedItems = arrayMove(interleavedSidebarItems, oldIndex, targetIndex);
    await persistInterleavedSidebarOrder(reorderedItems);
  }, [interleavedSidebarItems, persistInterleavedSidebarOrder]);

  const createGroupWithWorkspaces = useCallback(async (workspaceIds: string[], order: number) => {
    const newGroupId = `group-${Date.now()}`;
    const newGroup: IWorkspaceGroup = {
      id: newGroupId,
      name: t('WorkspaceGroup.DefaultGroupName', { number: canonicalGroups.length + 1 }),
      collapsed: false,
      order,
    };

    await window.service.workspace.setGroup(newGroupId, newGroup);

    for (const workspaceId of workspaceIds) {
      await window.service.workspace.moveWorkspaceToGroup(workspaceId, newGroupId);
    }
  }, [canonicalGroups.length, t]);

  const deriveDragState = useCallback((event: Pick<DragMoveEvent, 'active' | 'over' | 'delta' | 'collisions'>): IDragState => {
    const { active, over } = event;
    const activeId = String(active.id);
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
      // dnd-kit caches droppable rects and may return stale positions after DOM
      // mutations (e.g. workspaces moving between ungrouped/grouped sections).
      // The over.id itself is still correct (collision detection resolves the
      // right target), but over.rect can be stale. Query the live DOM rect of
      // the known target workspace to compute accurate zone boundaries.
      const activeRect = active.rect.current.translated;
      // Use the actual pointer Y computed from the initial pointerdown position
      const pointerY = pointerYReference.current ?? (activeRect
        ? activeRect.top + activeRect.height / 2
        : (over?.rect ? over.rect.top + over.rect.height / 2 : 0));
      const referenceY = pointerY;

      const overRect = over?.rect ?? null;
      const resolvedOverId = overId;
      const resolvedOverWorkspace = overWorkspace;

      if (!overRect || !resolvedOverId) {
        return {
          ...dragStateReference.current,
          activeId,
          overId: resolvedOverId,
          intent: null,
          projectedWorkspaceOrder: null,
          projectedGroupOrder: null,
        };
      }

      const isSameGroup = activeWorkspace?.groupId && resolvedOverWorkspace?.groupId && activeWorkspace.groupId === resolvedOverWorkspace.groupId;
      const canGroup = !isSameGroup && isGroupableWorkspace(activeWorkspace) && isGroupableWorkspace(resolvedOverWorkspace);
      let intent: TDragIntent;

      const reorderIntent = getReorderIntentFromPointer({
        pointerY: referenceY,
        rect: overRect,
      });
      const relativeY = Math.min(Math.max(referenceY - overRect.top, 0), overRect.height);
      const beforeBoundary = overRect.height / 3;
      const afterBoundary = overRect.height - beforeBoundary;

      if (relativeY > beforeBoundary && relativeY < afterBoundary && canGroup) {
        intent = 'group';
      } else {
        intent = reorderIntent;
      }

      return {
        intent,
        overId: resolvedOverId,
        activeId,
        projectedWorkspaceOrder: intent === 'reorder-before' || intent === 'reorder-after'
          ? computeWorkspaceProjection(activeId, resolvedOverId, intent)
          : null,
        projectedGroupOrder: null,
      };
    }

    if (activeType === 'group' && overType === 'group') {
      const overId = effectiveOverId;
      const overRect = over?.rect ?? null;

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

      const pointerY = pointerYReference.current ?? (overRect.top + overRect.height / 2);

      return {
        intent: getReorderIntentFromPointer({
          pointerY,
          rect: overRect,
        }),
        overId,
        activeId,
        projectedWorkspaceOrder: null,
        projectedGroupOrder: null,
      };
    }

    if (activeType === 'group' && overType === 'workspace') {
      const overId = effectiveOverId;
      const overRect = over?.rect ?? null;

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

      const pointerY = pointerYReference.current ?? (overRect.top + overRect.height / 2);

      return {
        intent: getReorderIntentFromPointer({
          pointerY,
          rect: overRect,
        }),
        overId,
        activeId,
        projectedWorkspaceOrder: null,
        projectedGroupOrder: null,
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
  }, [canonicalWorkspaces, computeWorkspaceProjection]);

  const updateDragStateFromEvent = useCallback((event: DragMoveEvent | DragOverEvent) => {
    const nextDragState = deriveDragState(event);

    // Only cache group/ungroup intents that are not sensitive to minor pointer drift.
    // Reorder intents (before/after) depend on exact pointer position within the target rect,
    // so caching them can cause handleDragEnd to use a stale intent when the pointer
    // briefly crossed a boundary during smooth mouse movement.
    if (
      nextDragState.activeId !== null &&
      nextDragState.overId !== null &&
      (nextDragState.intent === 'group' || nextDragState.intent === 'ungroup')
    ) {
      lastResolvedDragStateReference.current = nextDragState;
    }

    // Do NOT update dragStateReference.current here.
    // applyDragState updates it when setDragState actually fires, so the equality
    // check inside applyDragState works correctly. If we updated the ref early,
    // the debounced applyDragState would see the same state and skip the render,
    // breaking visual feedback (drag intent) during drag.

    // Debounce the React state update to prevent "Maximum update depth exceeded"
    // when rapid onDragMove/onDragOver events fire in quick succession.
    // See https://github.com/clauderic/dnd-kit/issues/900
    if (dragStateTimeoutReference.current !== null) {
      clearTimeout(dragStateTimeoutReference.current);
    }
    dragStateTimeoutReference.current = window.setTimeout(() => {
      dragStateTimeoutReference.current = null;
      applyDragState(nextDragState);
    }, 0);
  }, [applyDragState, deriveDragState]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    updateDragStateFromEvent(event);
  }, [updateDragStateFromEvent]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    updateDragStateFromEvent(event);
  }, [updateDragStateFromEvent]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    clearDragStateTimeout();
    lastResolvedDragStateReference.current = initialDragState;
    applyDragState(previous => ({ ...previous, activeId: String(event.active.id) }));
  }, [applyDragState, clearDragStateTimeout]);

  const handleDragCancel = useCallback(async (_event: DragCancelEvent) => {
    resetDragState();
  }, [resetDragState]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active } = event;
    const activeId = String(active.id);
    const previewDragState = dragStateReference.current;
    const lastResolvedDragState = lastResolvedDragStateReference.current;
    const shouldUsePreviewDragState = previewDragState.activeId === activeId && (
      previewDragState.overId !== null ||
      previewDragState.intent !== null ||
      previewDragState.projectedWorkspaceOrder !== null ||
      previewDragState.projectedGroupOrder !== null
    );
    const shouldUseLastResolvedDragState = lastResolvedDragState.activeId === activeId && (
      lastResolvedDragState.overId !== null ||
      lastResolvedDragState.intent !== null ||
      lastResolvedDragState.projectedWorkspaceOrder !== null ||
      lastResolvedDragState.projectedGroupOrder !== null
    );
    const currentDragState = shouldUsePreviewDragState
      ? previewDragState
      : shouldUseLastResolvedDragState
      ? lastResolvedDragState
      : deriveDragState(event);
    dragStateReference.current = currentDragState;
    resetDragState();

    const { intent: currentIntent, overId: currentOverId } = currentDragState;
    if (!currentIntent || !currentOverId || activeId === currentOverId) {
      return;
    }

    const overId = currentOverId;
    const resolvedOverType = overId.startsWith('group-') ? 'group' : 'workspace';

    // === Case: Group dropped on group → reorder groups ===
    // Group headers are small (~32px), so before/after intent detection from
    // pointer position is unreliable. Use direct index swap like the legacy
    // implementation to ensure predictable reordering.
    if (activeId.startsWith('group-') && overId.startsWith('group-')) {
      await reorderSidebarItems(activeId, overId, 'direct');
      return;
    }

    // === Case: Group dropped on workspace → reorder in the mixed sidebar sequence ===
    // Always place the group before the target workspace. Group headers act as
    // section titles and should naturally precede the content they organize.
    if (activeId.startsWith('group-') && resolvedOverType === 'workspace') {
      await reorderSidebarItems(activeId, overId, 'before');
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
        // From grouped to ungrouped → create a dedicated group with the hovered workspace
        if (activeWorkspace.groupId && !overWorkspace.groupId) {
          await createGroupWithWorkspaces([activeId, overId], overWorkspace.order ?? 0);
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
          await createGroupWithWorkspaces([activeId, overId], Math.min(activeWorkspace.order ?? 0, overWorkspace.order ?? 0));
          return;
        }
      }

      await reorderWorkspaces(activeId, overId, currentIntent === 'reorder-after' ? 'after' : 'before');
      return;
    }
  }, [canonicalWorkspaces, createGroupWithWorkspaces, deriveDragState, reorderSidebarItems, reorderWorkspaces, resetDragState]);

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
        measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={allDraggableIds} strategy={dragState.activeId?.startsWith('group-') ? undefined : verticalListSortingStrategy}>
          {interleavedSidebarItems.map((item, index) => {
            if (!isSidebarGroupItem(item)) {
              return (
                <UngroupedSection key={`item-${item.workspace.id}`}>
                  <SortableWorkspaceSelectorButton
                    index={index}
                    workspace={item.workspace}
                    showSidebarTexts={showSideBarText}
                    showSideBarIcon={showSideBarIcon}
                  />
                </UngroupedSection>
              );
            }

            return (
              <React.Fragment key={item.group.id}>
                <SortableGroupHeader
                  group={item.group}
                  onToggleCollapse={handleToggleCollapse}
                />
                <Collapse in={!item.group.collapsed} timeout='auto' unmountOnExit>
                  <GroupContent>
                    {item.workspaces.map((workspace, workspaceIndex) => (
                      <SortableWorkspaceSelectorButton
                        key={`item-${workspace.id}`}
                        index={workspaceIndex}
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
          {activeWorkspace && (
            <DragOverlayWorkspaceItem
              workspace={activeWorkspace}
              showSideBarIcon={showSideBarIcon}
              showSideBarText={showSideBarText}
            />
          )}
          {activeGroup && <DragOverlayGroupHeaderItem group={activeGroup} />}
        </DragOverlay>
      </DndContext>
    </DragContext.Provider>
  );
}
