import { container } from '@services/container';
import type { IPreferenceService } from '@services/preferences/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkspaceService } from '@services/workspaces/interface';

/**
 * Helper function to determine the target workspace for tidgi mini window based on preferences
 * @param fallbackWorkspaceId - The workspace ID to use as fallback (usually the active/current workspace)
 * @returns Object containing shouldSync flag and targetWorkspaceId
 */
export async function getTidgiMiniWindowTargetWorkspace(fallbackWorkspaceId?: string): Promise<{
  shouldSync: boolean;
  targetWorkspaceId: string | undefined;
}> {
  const preferenceService = container.get<IPreferenceService>(serviceIdentifier.Preference);
  const [tidgiMiniWindowSyncWorkspaceWithMainWindow, tidgiMiniWindowFixedWorkspaceId] = await Promise.all([
    preferenceService.get('tidgiMiniWindowSyncWorkspaceWithMainWindow'),
    preferenceService.get('tidgiMiniWindowFixedWorkspaceId'),
  ]);

  // Default to sync (undefined means default to true, or explicitly true)
  const shouldSync = tidgiMiniWindowSyncWorkspaceWithMainWindow === undefined || tidgiMiniWindowSyncWorkspaceWithMainWindow;

  let targetWorkspaceId: string | undefined;
  if (shouldSync) {
    // Sync with main window - use fallback or active workspace
    targetWorkspaceId = fallbackWorkspaceId ?? (await container.get<IWorkspaceService>(serviceIdentifier.Workspace).getActiveWorkspace())?.id;
  } else {
    // Use fixed workspace
    targetWorkspaceId = tidgiMiniWindowFixedWorkspaceId;
  }

  return { shouldSync, targetWorkspaceId };
}
