import { Box, styled, Typography } from '@mui/material';
import { IPromptPart } from '@services/agentInstance/promptConcat/promptConcatSchema';
import React from 'react';

const TreeItem = styled(Box, {
  shouldForwardProp: (property: string) => property !== 'depth',
})<{ depth: number }>(({ theme, depth }) => ({
  padding: theme.spacing(1.5),
  margin: `${depth * 8}px 0 0 ${depth * 16}px`,
  borderLeft: `2px solid ${theme.palette.primary.main}`,
  background: theme.palette.background.default,
  borderRadius: Number(theme.shape.borderRadius) / 2,
  '&:hover': {
    background: theme.palette.action.hover,
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
export const PromptTreeNode = React.memo(({ node, depth }: { node: IPromptPart; depth: number }): React.ReactElement => {
  return (
    <TreeItem depth={depth}>
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
      {node.children?.length && node.children.map(child => <PromptTreeNode key={child.id} node={child} depth={depth + 1} />)}
    </TreeItem>
  );
});

/**
 * Prompt tree component
 */
export const PromptTree = React.memo(({ prompts }: { prompts?: IPromptPart[] }): React.ReactElement => {
  if (!prompts?.length) {
    return <EmptyState>No prompt tree to display</EmptyState>;
  }

  return (
    <Box>
      {prompts.map(item => <PromptTreeNode key={item.id} node={item} depth={0} />)}
    </Box>
  );
});
