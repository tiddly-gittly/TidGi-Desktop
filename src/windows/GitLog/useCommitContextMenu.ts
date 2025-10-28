import GitHubIcon from '@mui/icons-material/GitHub';
import CheckoutIcon from '@mui/icons-material/Restore';
import RevertIcon from '@mui/icons-material/Undo';
import type { IWorkspace } from '@services/workspaces/interface';
import type { Commit } from '@tomplum/react-git-log';
import { useCallback } from 'react';

export function useCommitContextMenu(workspaceInfo: IWorkspace | null) {
  const handleContextMenu = useCallback(async (commit: Commit, event: React.MouseEvent) => {
    event.preventDefault();

    if (!workspaceInfo || !('wikiFolderLocation' in workspaceInfo)) return;

    // Show context menu with MUI
    const menu = [
      {
        label: 'Checkout this commit',
        icon: CheckoutIcon,
        action: async () => {
          try {
            await window.service.git.checkoutCommit(
              workspaceInfo.wikiFolderLocation,
              commit.hash,
            );
            await window.service.notification.show({
              title: 'Checkout successful',
              body: `Checked out to commit ${commit.hash}`,
            });
          } catch (error_) {
            const error = error_ as Error;
            await window.service.notification.show({
              title: 'Checkout failed',
              body: error.message,
            });
          }
        },
      },
      {
        label: 'Revert this commit',
        icon: RevertIcon,
        action: async () => {
          try {
            await window.service.git.revertCommit(
              workspaceInfo.wikiFolderLocation,
              commit.hash,
            );
            await window.service.notification.show({
              title: 'Revert successful',
              body: `Reverted commit ${commit.hash}`,
            });
          } catch (error_) {
            const error = error_ as Error;
            await window.service.notification.show({
              title: 'Revert failed',
              body: error.message,
            });
          }
        },
      },
    ];

    // Add GitHub link if gitUrl is available
    if ('gitUrl' in workspaceInfo && workspaceInfo.gitUrl) {
      menu.push({
        label: 'Open on GitHub',
        icon: GitHubIcon,
        action: async () => {
          const url = `${workspaceInfo.gitUrl}/commit/${commit.hash}`;
          await window.service.native.openURI(url);
        },
      });
    }

    // Note: MUI Menu requires React state management,
    // so we'll trigger the menu through a custom event that the component can handle
    const customEvent = new CustomEvent('showCommitContextMenu', {
      detail: { commit, menu, position: { x: event.clientX, y: event.clientY } },
    });
    window.dispatchEvent(customEvent);
  }, [workspaceInfo]);

  return { handleContextMenu };
}
