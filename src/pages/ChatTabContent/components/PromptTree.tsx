import { Box, styled, Typography } from '@mui/material';
import { IPrompt } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAgentChatStore } from '../../Agent/store/agentChatStore/index';

const TreeItem = styled(Box, {
  shouldForwardProp: (property: string) => property !== 'depth',
})<{ depth: number }>(({ theme, depth }) => ({
  padding: theme.spacing(1.5),
  margin: `${depth * 8}px 0 0 ${depth * 16}px`,
  borderLeft: `2px solid ${theme.palette.primary.main}`,
  background: theme.palette.background.default,
  borderRadius: Number(theme.shape.borderRadius) / 2,
  cursor: 'pointer',
  '&:active': {
    transform: 'scale(0.98)',
    background: theme.palette.action.selected,
    transition: theme.transitions.create(['transform', 'background-color'], {
      duration: theme.transitions.duration.shorter,
    }),
  },
}));

const EmptyState = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: 240,
  color: theme.palette.text.secondary,
  '& > svg': {
    fontSize: 48,
    marginBottom: theme.spacing(2),
    opacity: 0.5,
  },
}));

/**
 * Prompt tree node component for nested display
 */
export const PromptTreeNode = ({
  node,
  depth,
  fieldPath = [],
}: {
  node: IPrompt;
  depth: number;
  fieldPath?: string[];
}): React.ReactElement => {
  const { setFormFieldsToScrollTo, expandPathToTarget } = useAgentChatStore(
    useShallow((state) => ({
      setFormFieldsToScrollTo: state.setFormFieldsToScrollTo,
      expandPathToTarget: state.expandPathToTarget,
    })),
  );
  const handleNodeClick = (event: React.MouseEvent) => {
    event.stopPropagation();

    const targetFieldPath = (node.source && node.source.length > 0) ? node.source : [...fieldPath, node.id];

    setFormFieldsToScrollTo(targetFieldPath);
    expandPathToTarget(targetFieldPath);
  };

  return (
    <TreeItem
      depth={depth}
      onClick={handleNodeClick}
    >
      <Typography variant='subtitle2' color='primary' gutterBottom>
        {node.caption || node.id || 'Prompt'}
      </Typography>
      {node.text && (
        <Typography
          variant='body2'
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            mb: node.children?.length ? 2 : 0,
          }}
        >
          {node.text}
        </Typography>
      )}
      {node.children && node.children.length > 0 && node.children.map((child: IPrompt) => {
        const childFieldPath = [...fieldPath, child.id];
        return (
          <PromptTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            fieldPath={childFieldPath}
          />
        );
      })}
    </TreeItem>
  );
};

/**
 * Prompt tree component
 */
export const PromptTree = ({ prompts }: { prompts?: IPrompt[] }): React.ReactElement => {
  if (!prompts?.length) {
    return <EmptyState>No prompt tree to display</EmptyState>;
  }

  return (
    <Box>
      {prompts.map((item) => {
        const fieldPath = ['prompts', item.id];
        return <PromptTreeNode key={item.id} node={item} depth={0} fieldPath={fieldPath} />;
      })}
    </Box>
  );
};
