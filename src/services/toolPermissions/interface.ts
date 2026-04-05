import { ProxyPropertyType } from "electron-ipc-cat/common";
import type { BehaviorSubject } from "rxjs";

import { ToolPermissionsChannel } from "@/constants/channels";

export interface IToolPermissionEntry {
  toolName: string;
  /** 'blacklist' or 'whitelist' */
  listType: "blacklist" | "whitelist";
  /** Optional pattern for matching tool parameters */
  pattern?: string;
  /** When this entry was added */
  addedAt: string;
  /** Optional note/reason */
  note?: string;
}

export interface IToolApprovalRequest {
  /** Unique ID for this approval request */
  id: string;
  /** Agent instance ID requesting the tool */
  agentId: string;
  /** Tool name being requested */
  toolName: string;
  /** Tool parameters (JSON stringified) */
  parameters: string;
  /** Requesting node ID (for remote calls) */
  nodeId?: string;
  /** Timestamp of request */
  requestedAt: string;
}

export type ToolApprovalDecision =
  | "allow-once"
  | "allow-session"
  | "allow-always"
  | "deny";

export interface IToolPermissionsService {
  /**
   * Get all tool permission entries (blacklist + whitelist)
   */
  getPermissions(): Promise<IToolPermissionEntry[]>;

  /**
   * Add a tool to blacklist or whitelist
   */
  addPermission(entry: Omit<IToolPermissionEntry, "addedAt">): Promise<void>;

  /**
   * Remove a tool permission entry
   */
  removePermission(
    toolName: string,
    listType: "blacklist" | "whitelist",
  ): Promise<void>;

  /**
   * Clear all entries from blacklist or whitelist
   */
  clearList(listType: "blacklist" | "whitelist"): Promise<void>;

  /**
   * Check if a tool is allowed to execute
   * Returns true if allowed, false if blocked
   */
  checkPermission(
    toolName: string,
    parameters?: Record<string, unknown>,
  ): Promise<boolean>;

  /**
   * Request approval for a tool execution
   * Returns a promise that resolves when user makes a decision
   */
  requestApproval(
    request: Omit<IToolApprovalRequest, "id" | "requestedAt">,
  ): Promise<ToolApprovalDecision>;

  /**
   * Resolve a pending approval request (called from UI)
   */
  resolveApproval(
    requestId: string,
    decision: ToolApprovalDecision,
  ): Promise<void>;

  /**
   * Observable stream of pending approval requests
   */
  pendingApprovals$: BehaviorSubject<IToolApprovalRequest[]>;

  /**
   * Get current session-level approvals
   */
  getSessionApprovals(): Promise<string[]>;

  /**
   * Clear session-level approvals (on app restart or manual clear)
   */
  clearSessionApprovals(): Promise<void>;
}

export const ToolPermissionsServiceIPCDescriptor = {
  channel: ToolPermissionsChannel.name,
  properties: {
    getPermissions: ProxyPropertyType.Function,
    addPermission: ProxyPropertyType.Function,
    removePermission: ProxyPropertyType.Function,
    clearList: ProxyPropertyType.Function,
    checkPermission: ProxyPropertyType.Function,
    requestApproval: ProxyPropertyType.Function,
    resolveApproval: ProxyPropertyType.Function,
    pendingApprovals$: ProxyPropertyType.Value$,
    getSessionApprovals: ProxyPropertyType.Function,
    clearSessionApprovals: ProxyPropertyType.Function,
  },
};
