/* eslint-disable unicorn/no-null */
import { Box, Button, Card, CardActionArea, CardContent, Fade, Menu, MenuItem, Typography } from '@mui/material';
import type { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import is from 'typescript-styled-is';
import type { IWorkflowTiddler } from './useWorkflowDataSource';

const WorkflowCard = styled(Card)<{ $backgroundImage?: string }>`
  ${is('$backgroundImage')`
    background-image: url(${(props: { $backgroundImage: string }) => props.$backgroundImage});
  `}
  background-size: cover;
  background-blend-mode: darken;
`;

const WorkflowTitle = styled(Typography)`
  color: white;
`;

export function WorkflowListItem(props: IWorkflowListItem) {
  const [anchorElement, setAnchorElement] = useState<null | HTMLElement>(null);

  const handleOpenItemMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorElement(event.currentTarget);
  }, []);

  const handleCloseItemMenu = useCallback(() => {
    setAnchorElement(null);
  }, []);
  return (
    <WorkflowCard $backgroundImage={props.image}>
      <CardActionArea>
        <CardContent>
          <WorkflowTitle variant='h5'>{props.title}</WorkflowTitle>
        </CardContent>
      </CardActionArea>
      <Button aria-controls='fade-menu' aria-haspopup='true' onClick={handleOpenItemMenu}>
        Options
      </Button>
      <Menu
        id='fade-menu'
        anchorEl={anchorElement}
        keepMounted
        open={anchorElement !== null}
        onClose={handleCloseItemMenu}
        TransitionComponent={Fade}
      >
        <MenuItem onClick={handleCloseItemMenu}>Delete</MenuItem>
        <MenuItem onClick={handleCloseItemMenu}>Add to mine</MenuItem>
      </Menu>
    </WorkflowCard>
  );
}

export interface IWorkflowListItem {
  description?: string;
  id: string;
  image?: string;
  metadata?: {
    tiddler: IWorkflowTiddler;
    workspace?: IWorkspaceWithMetadata;
  };
  tags: string[];
  title: string;
  workspaceID: string;
}

interface IWorkflowListProps {
  workflows: IWorkflowListItem[];
}

export const WorkflowList: React.FC<IWorkflowListProps> = ({ workflows }) => {
  return (
    <Box>
      {workflows.map((workflow) => <WorkflowListItem key={workflow.id} {...workflow} />)}
    </Box>
  );
};
