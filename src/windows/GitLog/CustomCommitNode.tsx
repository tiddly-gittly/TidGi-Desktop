import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import type { Commit } from '@tomplum/react-git-log';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

dayjs.extend(relativeTime);

const NodeCircle = styled('div')<{ $colour: string; $isIndexPseudoNode: boolean; $nodeSize: number }>`
  width: ${({ $nodeSize }) => $nodeSize}px;
  height: ${({ $nodeSize }) => $nodeSize}px;
  border-radius: 50%;
  border: 2px ${({ $isIndexPseudoNode }) => ($isIndexPseudoNode ? 'dotted' : 'solid')} ${({ $colour }) => $colour};
  background-color: ${({ $colour }) => $colour};
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.2);
  }
`;

interface ICustomCommitNodeProps {
  colour: string;
  commit: Commit;
  isIndexPseudoNode: boolean;
  nodeSize: number;
  onContextMenu?: (commit: Commit, event: React.MouseEvent) => void;
}

export function CustomCommitNode({ colour, commit, isIndexPseudoNode, nodeSize, onContextMenu }: ICustomCommitNodeProps): React.JSX.Element {
  const { t } = useTranslation();
  const [fileCount, setFileCount] = useState<number>(0);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);

  useEffect(() => {
    const loadFileCount = async () => {
      try {
        const meta = window.meta();
        const workspaceID = (meta as { workspaceID?: string }).workspaceID;

        if (!workspaceID) return;

        const workspace = await window.service.workspace.get(workspaceID);
        if (!workspace || !('wikiFolderLocation' in workspace)) return;

        const files = await window.service.git.getCommitFiles(workspace.wikiFolderLocation, commit.hash);
        setFileCount(files.length);
      } catch (error) {
        console.error('Failed to load file count:', error);
        setFileCount(0);
      }
    };

    void loadFileCount();
  }, [commit.hash]);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu(
      contextMenu === null
        ? {
          mouseX: event.clientX + 2,
          mouseY: event.clientY - 6,
        }
        : null,
    );

    if (onContextMenu) {
      onContextMenu(commit, event);
    }
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleCheckout = async () => {
    try {
      const meta = window.meta();
      const workspaceID = (meta as { workspaceID?: string }).workspaceID;

      if (!workspaceID) return;

      const workspace = await window.service.workspace.get(workspaceID);
      if (!workspace || !('wikiFolderLocation' in workspace)) return;

      await window.service.git.checkoutCommit(workspace.wikiFolderLocation, commit.hash);
      // TODO: Show success notification
    } catch (error) {
      console.error('Failed to checkout commit:', error);
      // TODO: Show error notification
    }
    handleClose();
  };

  const handleRevert = async () => {
    try {
      const meta = window.meta();
      const workspaceID = (meta as { workspaceID?: string }).workspaceID;

      if (!workspaceID) return;

      const workspace = await window.service.workspace.get(workspaceID);
      if (!workspace || !('wikiFolderLocation' in workspace)) return;

      await window.service.git.revertCommit(workspace.wikiFolderLocation, commit.hash);
      // TODO: Show success notification
    } catch (error) {
      console.error('Failed to revert commit:', error);
      // TODO: Show error notification
    }
    handleClose();
  };

  const handleCopyHash = () => {
    navigator.clipboard.writeText(commit.hash).catch((error: unknown) => {
      console.error('Failed to copy hash:', error);
    });
    handleClose();
  };

  const handleOpenInGitHub = async () => {
    try {
      const meta = window.meta();
      const workspaceID = (meta as { workspaceID?: string }).workspaceID;

      if (!workspaceID) return;

      const workspace = await window.service.workspace.get(workspaceID);
      if (!workspace || !('wikiFolderLocation' in workspace) || !('gitUrl' in workspace)) return;

      if (workspace.gitUrl) {
        // Convert git URL to GitHub web URL
        const githubUrl = workspace.gitUrl
          .replace(/\.git$/, '')
          .replace(/^git@github\.com:/, 'https://github.com/');
        const commitUrl = `${githubUrl}/commit/${commit.hash}`;
        window.open(commitUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to open in GitHub:', error);
    }
    handleClose();
  };

  const commitDate = dayjs(commit.committerDate);
  const tooltipContent = (
    <div>
      <div>
        <strong>{t('GitLog.Message')}:</strong> {commit.message}
      </div>
      <div>
        <strong>{t('GitLog.Author')}:</strong> {commit.author?.name || 'Unknown'}
      </div>
      <div>
        <strong>{t('GitLog.Date')}:</strong> {commitDate.format('YYYY-MM-DD HH:mm:ss')}
      </div>
      <div>
        <strong>{t('GitLog.RelativeTime')}:</strong> {commitDate.fromNow()}
      </div>
      <div>
        <strong>{t('GitLog.FilesCount')}:</strong> {fileCount} {t('GitLog.Files')}
      </div>
    </div>
  );

  return (
    <>
      <Tooltip title={tooltipContent} placement='right' arrow>
        <NodeCircle
          $colour={colour}
          $isIndexPseudoNode={isIndexPseudoNode}
          $nodeSize={nodeSize}
          onContextMenu={handleContextMenu}
        />
      </Tooltip>

      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference='anchorPosition'
        anchorPosition={contextMenu !== null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={handleCheckout}>{t('GitLog.CheckoutCommit')}</MenuItem>
        <MenuItem onClick={handleRevert}>{t('GitLog.RevertCommit')}</MenuItem>
        <MenuItem onClick={handleCopyHash}>{t('GitLog.CopyHash')}</MenuItem>
        <MenuItem onClick={handleOpenInGitHub}>{t('GitLog.OpenInGitHub')}</MenuItem>
      </Menu>
    </>
  );
}
