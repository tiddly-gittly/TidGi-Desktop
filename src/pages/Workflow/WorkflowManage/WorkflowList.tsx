/* eslint-disable unicorn/no-null, @typescript-eslint/strict-boolean-expressions, unicorn/no-useless-undefined */
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { Box, Button, Card, CardActionArea, CardActions, CardContent, CardMedia, Chip, Fade, Menu, MenuItem, Stack, Typography } from '@mui/material';
import type { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import type { IWorkflowTiddler } from './useWorkflowDataSource';

const WorkflowListContainer = styled(Box)`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: flex-start;
`;
const WorkflowCard = styled(Card)`
  display: flex;
  flex-direction: column;
  position: relative;
  width: 300px;
  justify-content: space-between;
  margin-right: 1em;
  margin-bottom: 1em;
`;
const ItemMenuCardActions = styled(CardActions)`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
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
  const handleOpenInWiki = useCallback(() => {
    setAnchorElement(null);
    // TODO: open in wiki
  }, [item, onDeleteWorkflow]);
  const menuID = `workflow-list-item-menu-${item.id}`;
  return (
    <WorkflowCard>
      <CardActionArea>
        {item.image && (
          <CardMedia
            component='img'
            height='140'
            image={item.image}
            alt={`screenshot of workflow ${item.title}`}
          />
        )}
        <CardContent>
          <Typography gutterBottom variant='h5' component='div'>{item.title}</Typography>
          {item.tags && (
            <Stack direction='row' spacing={1} flexWrap='wrap'>
              {item.tags.map(tag => <Chip key={tag} label={tag} style={{ marginBottom: '0.3em' }} clickable />)}
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
      <ItemMenuCardActions>
        <Button>{t('Open')}</Button>
        <Button aria-controls={menuID} aria-haspopup='true' onClick={handleOpenItemMenu}>
          {anchorElement === null ? <MenuIcon /> : <MenuOpenIcon />}
        </Button>
      </ItemMenuCardActions>
      <Menu
        id={menuID}
        anchorEl={anchorElement}
        keepMounted
        open={anchorElement !== null}
        onClose={handleCloseItemMenu}
        TransitionComponent={Fade}
      >
        <MenuItem onClick={handleDelete}>{t('Delete')}</MenuItem>
        <MenuItem onClick={handleOpenInWiki}>{t('Workflow.OpenInWorkspaceTiddler', { title: item.title, workspace: item.metadata?.workspace?.name ?? t('AddWorkspace.MainWorkspace') })}</MenuItem>
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
  const [itemToDelete, setDeleteItem] = useState<IWorkflowListItem | undefined>();
  const handleDeleteConfirmed = useCallback(() => {
    if (itemToDelete) {
      onDeleteWorkflow(itemToDelete);
      setDeleteItem(undefined);
    }
  }, [itemToDelete, onDeleteWorkflow]);
  const handleDeleteWithConfirmation = useCallback((item: IWorkflowListItem) => {
    setDeleteItem(item);
  }, []);
  const handleDeleteCancel = useCallback(() => {
    setDeleteItem(undefined);
  }, []);

  return (
    <>
      <WorkflowListContainer>
        {workflows.map((workflow) => <WorkflowListItem key={workflow.id} item={workflow} onDeleteWorkflow={handleDeleteWithConfirmation} />)}
      </WorkflowListContainer>
      <DeleteConfirmationDialog
        open={itemToDelete !== undefined}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirmed}
      />
    </>
  );
};
