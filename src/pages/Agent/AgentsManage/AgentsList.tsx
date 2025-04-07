import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { Box, Button, Card, CardActionArea, CardActions, CardContent, CardMedia, Chip, Fade, Menu, MenuItem, Stack, Typography } from '@mui/material';
import type { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Masonry from 'react-masonry-css';
import styled from 'styled-components';

import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import type { IAgentTiddler } from './useAgentDataSource';
import { useHandleOpenInTheGraphEditor, useHandleOpenInTheRunAgent } from './useClickHandler';
import { useHandleOpenInWiki } from './useHandleOpenInWiki';

const AgentListContainer = styled(Box)`
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
const AgentCard = styled(Card)`
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

interface IAgentListItemProps {
  handleOpenChangeMetadataDialog: (item: IAgentListItem) => void;
  item: IAgentListItem;
  onDeleteAgent: (item: IAgentListItem) => void;
}
export function AgentListItem(props: IAgentListItemProps) {
  const { t } = useTranslation();
  const { onDeleteAgent, item, handleOpenChangeMetadataDialog: handleOpenChangeMetadataDialogRaw } = props;
  const [anchorElement, setAnchorElement] = useState<null | HTMLElement>(null);

  const handleOpenItemMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorElement(event.currentTarget);
  }, []);

  const handleCloseItemMenu = useCallback(() => {
    setAnchorElement(null);
  }, []);
  const handleDelete = useCallback(() => {
    setAnchorElement(null);
    onDeleteAgent(item);
  }, [item, onDeleteAgent]);
  const handleOpenChangeMetadataDialog = useCallback(() => {
    setAnchorElement(null);
    handleOpenChangeMetadataDialogRaw(item);
  }, [item, handleOpenChangeMetadataDialogRaw]);

  const handleOpenInWiki = useHandleOpenInWiki(item);

  const handleOpenInTheGraphEditor = useHandleOpenInTheGraphEditor(item);
  const handleOpenInTheRunAgent = useHandleOpenInTheRunAgent(item);

  const menuID = `agent-list-item-menu-${item.id}`;
  return (
    <AgentCard>
      <CardActionArea onClick={handleOpenInTheGraphEditor}>
        {item.image && (
          <CardMedia
            component='img'
            height='140'
            image={item.image}
            alt={`screenshot of agent ${item.title}`}
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
        <Button onClick={handleOpenInTheRunAgent}>{t('Agent.Use')}</Button>
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
          {t('Agent.ChangeMetadata')}
        </MenuItem>
        <MenuItem onClick={handleOpenInWiki}>
          {t('Agent.OpenInWorkspaceTiddler', { title: item.title, workspace: item.metadata?.workspace?.name ?? t('AddWorkspace.MainWorkspace') })}
        </MenuItem>
      </Menu>
    </AgentCard>
  );
}

export interface IAgentListItem {
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
    tiddler?: IAgentTiddler;
    workspace?: IWorkspaceWithMetadata;
  };
  tags: string[];
  title: string;
  workspaceID: string;
}

interface IAgentListProps {
  handleOpenChangeMetadataDialog: (item: IAgentListItem) => void;
  onDeleteAgent: (item: IAgentListItem) => void;
  agents: IAgentListItem[];
}

export const AgentList: React.FC<IAgentListProps> = ({ agents, onDeleteAgent, handleOpenChangeMetadataDialog }) => {
  const [itemToDelete, setDeleteItem] = useState<IAgentListItem | undefined>();
  const handleDeleteConfirmed = useCallback(() => {
    if (itemToDelete) {
      onDeleteAgent(itemToDelete);
      setDeleteItem(undefined);
    }
  }, [itemToDelete, onDeleteAgent]);
  const handleDeleteWithConfirmation = useCallback((item: IAgentListItem) => {
    setDeleteItem(item);
  }, []);
  const handleDeleteCancel = useCallback(() => {
    setDeleteItem(undefined);
  }, []);

  return (
    <>
      <AgentListContainer>
        <Masonry
          breakpointCols={{ default: 4, 1320: 3, 990: 2, 680: 1 }}
          className='masonry-grid'
          columnClassName='masonry-grid_column'
        >
          {agents.map((agent) => (
            <div key={agent.id}>
              <AgentListItem key={agent.id} item={agent} onDeleteAgent={handleDeleteWithConfirmation} handleOpenChangeMetadataDialog={handleOpenChangeMetadataDialog} />
            </div>
          ))}
        </Masonry>
      </AgentListContainer>
      <DeleteConfirmationDialog
        open={itemToDelete !== undefined}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirmed}
      />
    </>
  );
};
