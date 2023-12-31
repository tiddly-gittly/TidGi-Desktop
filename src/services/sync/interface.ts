import { SyncChannel } from '@/constants/channels';
import { IWorkspace } from '@services/workspaces/interface';

import { ProxyPropertyType } from 'electron-ipc-cat/common';

/**
 * Manage sync process and interval sync.
 */
export interface ISyncService {
  /**
   * Check if there is any draft in current workspace that block us syncing.
   * @returns true if can sync, false if cannot sync due to there is a draft in current workspace.
   */
  checkCanSyncDueToNoDraft(workspaceID: string): Promise<boolean>;
  clearAllSyncIntervals(): void;
  startIntervalSyncIfNeeded(workspace: IWorkspace): Promise<void>;
  stopIntervalSync(workspaceID: string): void;
  /**
   * Trigger git sync for a wiki workspace.
   * Simply do some check before calling `gitService.syncOrForcePull`, and after that, restart workspaceViewService if needed.
   */
  syncWikiIfNeeded(workspace: IWorkspace): Promise<void>;
}
export const SyncServiceIPCDescriptor = {
  channel: SyncChannel.name,
  properties: {
    clearAllSyncIntervals: ProxyPropertyType.Function,
    checkCanSyncDueToNoDraft: ProxyPropertyType.Function,
    startIntervalSyncIfNeeded: ProxyPropertyType.Function,
    stopIntervalSync: ProxyPropertyType.Function,
    syncWikiIfNeeded: ProxyPropertyType.Function,
  },
};
