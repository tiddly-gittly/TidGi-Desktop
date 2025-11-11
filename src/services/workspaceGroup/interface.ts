import { WorkspaceGroupChannel } from '@/constants/channels';
import { ProxyPropertyType } from 'electron-ipc-cat/common';
import { Observable } from 'rxjs';

/**
 * A workspace group contains multiple workspaces
 */
export interface IWorkspaceGroup {
  /**
   * Whether this group is currently expanded in the sidebar
   */
  collapsed: boolean;
  /**
   * Unique identifier for this group
   */
  id: string;
  /**
   * Display name of this group
   */
  name: string;
  /**
   * Order in the sidebar (same as workspace order system)
   */
  order: number;
  /**
   * Array of workspace IDs that belong to this group
   */
  workspaceIds: string[];
}

export interface IWorkspaceGroupService {
  /**
   * Add a workspace to a group
   */
  addWorkspaceToGroup(groupId: string, workspaceId: string): Promise<void>;
  /**
   * Create a new workspace group
   */
  create(name: string, workspaceIds: string[]): Promise<IWorkspaceGroup>;
  /**
   * Delete a workspace group (workspaces remain)
   */
  delete(groupId: string): Promise<void>;
  /**
   * Check if a workspace exists in any group
   */
  exists(id: string): Promise<boolean>;
  /**
   * Get a workspace group by ID
   */
  get(id: string): Promise<IWorkspaceGroup | undefined>;
  /**
   * Get observable for a specific group
   */
  get$(id: string): Observable<IWorkspaceGroup | undefined>;
  /**
   * Get all workspace groups
   */
  getAll(): Promise<Record<string, IWorkspaceGroup>>;
  /**
   * Get all groups as a sorted array
   */
  getAllAsList(): Promise<IWorkspaceGroup[]>;
  /**
   * Get the group that contains a specific workspace
   */
  getGroupByWorkspaceId(workspaceId: string): Promise<IWorkspaceGroup | undefined>;
  /**
   * Observable for all groups
   */
  groups$: Observable<Record<string, IWorkspaceGroup> | undefined>;
  /**
   * Remove a workspace from its group
   */
  removeWorkspaceFromGroup(workspaceId: string): Promise<void>;
  /**
   * Toggle collapse state of a group
   */
  toggleCollapse(groupId: string): Promise<void>;
  /**
   * Update a workspace group
   */
  update(id: string, updates: Partial<IWorkspaceGroup>): Promise<void>;
  /**
   * Update the subject to notify observers (internal use)
   */
  updateGroupsSubject(): void;
}

export const WorkspaceGroupServiceIPCDescriptor = {
  channel: WorkspaceGroupChannel.name,
  properties: {
    addWorkspaceToGroup: ProxyPropertyType.Function,
    create: ProxyPropertyType.Function,
    delete: ProxyPropertyType.Function,
    exists: ProxyPropertyType.Function,
    get: ProxyPropertyType.Function,
    get$: ProxyPropertyType.Function$,
    getAll: ProxyPropertyType.Function,
    getAllAsList: ProxyPropertyType.Function,
    getGroupByWorkspaceId: ProxyPropertyType.Function,
    groups$: ProxyPropertyType.Value$,
    removeWorkspaceFromGroup: ProxyPropertyType.Function,
    toggleCollapse: ProxyPropertyType.Function,
    update: ProxyPropertyType.Function,
    updateGroupsSubject: ProxyPropertyType.Function,
  },
};
