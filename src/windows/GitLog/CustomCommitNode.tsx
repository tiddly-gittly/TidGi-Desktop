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
}

export function CustomCommitNode({ colour, commit, isIndexPseudoNode, nodeSize }: ICustomCommitNodeProps): React.JSX.Element {
  const { t } = useTranslation();
  const [fileCount, setFileCount] = useState<number>(0);

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
    <Tooltip
      title={tooltipContent}
      placement='right'
      arrow
    >
      <NodeCircle
        $colour={colour}
        $isIndexPseudoNode={isIndexPseudoNode}
        $nodeSize={nodeSize}
      />
    </Tooltip>
  );
}
