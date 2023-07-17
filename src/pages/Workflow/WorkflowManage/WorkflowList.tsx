/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable unicorn/no-null, @typescript-eslint/strict-boolean-expressions, unicorn/no-useless-undefined */
import { WikiChannel } from '@/constants/channels';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { Box, Button, Card, CardActionArea, CardActions, CardContent, CardMedia, Chip, Fade, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { PageType } from '@services/pages/interface';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Masonry from 'react-masonry-css';
import styled from 'styled-components';
import { useLocation } from 'wouter';

import { WorkflowContext } from '../useContext';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import type { IWorkflowTiddler } from './useWorkflowDataSource';

const WorkflowListContainer = styled(Box)`
  width: 100%;
  .masonry-grid {
    display: flex;
    margin-left: -30px; /* gutter size offset */
    width: auto;
  }
  .masonry-grid_column {
    padding-left: 30px; /* gutter size */
    background-clip: padding-box;
  }
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
  handleOpenChangeMetadataDialog: (item: IWorkflowListItem) => void;
  item: IWorkflowListItem;
  onDeleteWorkflow: (item: IWorkflowListItem) => void;
}
export function WorkflowListItem(props: IWorkflowListItemProps) {
  const { t } = useTranslation();
  const { onDeleteWorkflow, item, handleOpenChangeMetadataDialog: handleOpenChangeMetadataDialogRaw } = props;
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
  const handleOpenChangeMetadataDialog = useCallback(() => {
    setAnchorElement(null);
    handleOpenChangeMetadataDialogRaw(item);
  }, [item, handleOpenChangeMetadataDialogRaw]);

  const [, setLocation] = useLocation();
  const handleOpenInWiki = useCallback(async () => {
    setAnchorElement(null);
    if (!item.workspaceID) return;
    const oldActivePage = await window.service.pages.getActivePage();
    await window.service.pages.setActivePage(PageType.wiki, oldActivePage?.type);
    await window.service.workspaceView.setActiveWorkspaceView(item.workspaceID);
    setLocation(`/${WindowNames.main}/${PageType.wiki}/${item.workspaceID}/`);
    window.service.wiki.wikiOperation(WikiChannel.openTiddler, item.workspaceID, item.title);
  }, [item, setLocation]);

  const workflowContext = useContext(WorkflowContext);
  const handleOpenInTheGraphEditor = useCallback(() => {
    setLocation(`/${WindowNames.main}/${PageType.workflow}/${item.id}/`);
    workflowContext.setOpenedWorkflowItem(item);
  }, [item, setLocation, workflowContext]);
  const menuID = `workflow-list-item-menu-${item.id}`;
  return (
    <WorkflowCard>
      <CardActionArea onClick={handleOpenInTheGraphEditor}>
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
        <Button onClick={handleOpenInTheGraphEditor}>{t('Open')}</Button>
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
        <MenuItem
          onClick={handleOpenChangeMetadataDialog}
        >
          {t('Workflow.ChangeMetadata')}
        </MenuItem>
        <MenuItem onClick={handleOpenInWiki}>
          {t('Workflow.OpenInWorkspaceTiddler', { title: item.title, workspace: item.metadata?.workspace?.name ?? t('AddWorkspace.MainWorkspace') })}
        </MenuItem>
      </Menu>
    </WorkflowCard>
  );
}

export interface IWorkflowListItem {
  description?: string;
  /**
   * Map to tiddler's text field. Store the JSON format of the graph.
   */
  graphJSONString: string;
  id: string;
  image?: string;
  /**
   * Things that only exist on runtime, and won't be persisted.
   */
  metadata?: {
    tiddler?: IWorkflowTiddler;
    workspace?: IWorkspaceWithMetadata;
  };
  tags: string[];
  title: string;
  workspaceID: string;
}

interface IWorkflowListProps {
  handleOpenChangeMetadataDialog: (item: IWorkflowListItem) => void;
  onDeleteWorkflow: (item: IWorkflowListItem) => void;
  workflows: IWorkflowListItem[];
}

export const WorkflowList: React.FC<IWorkflowListProps> = ({ workflows, onDeleteWorkflow, handleOpenChangeMetadataDialog }) => {
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
        <Masonry
          breakpointCols={{ default: 4, 1320: 3, 990: 2, 680: 1 }}
          className='masonry-grid'
          columnClassName='masonry-grid_column'
        >
          {workflows.map((workflow) => (
            <div key={workflow.id}>
              <WorkflowListItem key={workflow.id} item={workflow} onDeleteWorkflow={handleDeleteWithConfirmation} handleOpenChangeMetadataDialog={handleOpenChangeMetadataDialog} />
            </div>
          ))}
        </Masonry>
      </WorkflowListContainer>
      <DeleteConfirmationDialog
        open={itemToDelete !== undefined}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirmed}
      />
    </>
  );
};
