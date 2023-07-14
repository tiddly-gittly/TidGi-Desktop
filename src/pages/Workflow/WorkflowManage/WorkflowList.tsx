/* eslint-disable unicorn/no-null */
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { Box, Button, Card, CardActionArea, CardContent, Fade, Menu, MenuItem, Typography } from '@mui/material';
import type { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

interface IWorkflowListItemProps {
  item: IWorkflowListItem;
  onDeleteWorkflow: (item: IWorkflowListItem) => void;
}
export function WorkflowListItem(props: IWorkflowListItemProps) {
  const { t } = useTranslation();
  const { onDeleteWorkflow, item } = props;
  const [anchorElement, setAnchorElement] = useState<null | HTMLElement>(null);

  const handleOpenItemMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorElement(event.currentTarget);
  }, []);

  const handleCloseItemMenu = useCallback(() => {
    setAnchorElement(null);
  }, []);
  const handleDelete = useCallback(() => {
    setAnchorElement(null);
    onDeleteWorkflow(item);
  }, [item, onDeleteWorkflow]);
  const menuID = `workflow-list-item-menu-${item.id}`;
  return (
    <WorkflowCard $backgroundImage={item.image}>
      <CardActionArea>
        <CardContent>
          <WorkflowTitle variant='h5'>{item.title}</WorkflowTitle>
        </CardContent>
      </CardActionArea>
      <Button aria-controls={menuID} aria-haspopup='true' onClick={handleOpenItemMenu}>
        {anchorElement === null ? <MenuIcon /> : <MenuOpenIcon />}
      </Button>
      <Menu
        id={menuID}
        anchorEl={anchorElement}
        keepMounted
        open={anchorElement !== null}
        onClose={handleCloseItemMenu}
        TransitionComponent={Fade}
      >
        <MenuItem onClick={handleDelete}>{t('Delete')}</MenuItem>
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
  onDeleteWorkflow: (item: IWorkflowListItem) => void;
  workflows: IWorkflowListItem[];
}

export const WorkflowList: React.FC<IWorkflowListProps> = ({ workflows, onDeleteWorkflow }) => {
  return (
    <Box>
      {workflows.map((workflow) => <WorkflowListItem key={workflow.id} item={workflow} onDeleteWorkflow={onDeleteWorkflow} />)}
    </Box>
  );
};
