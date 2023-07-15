import AddIcon from '@mui/icons-material/Add';
import { Box, Chip, Fab, Stack, TextField } from '@mui/material';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import React, { ChangeEvent, useCallback, useState } from 'react';
import SimpleBar from 'simplebar-react';
import styled from 'styled-components';

import { AddItemDialog } from './AddItemDialog';
import { useAvailableFilterTags, useWorkflows } from './useWorkflowDataSource';
import { IWorkflowListItem, WorkflowList } from './WorkflowList';

const WorkflowManageContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  margin: 1em;

  width: 100%;
  height: 100vh;
  overflow: auto;
`;
const SearchRegionContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  margin-bottom: 1em;
  padding-right: 1em;
  width: 100%;
`;
const SearchBar = styled(TextField)`
  margin-bottom: 0.5em;
`;
const AddNewItemFloatingButton = styled(Fab)`
  position: absolute;
  bottom: 1em;
  right: 1em;
`;

export const WorkflowManage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const workspacesList = useWorkspacesListObservable();
  const [availableFilterTags, setTagsByWorkspace] = useAvailableFilterTags(workspacesList);
  const [workflows, onAddWorkflow, onDeleteWorkflow] = useWorkflows(workspacesList, setTagsByWorkspace);

  const [itemSelectedForDialog, setItemSelectedForDialog] = useState<IWorkflowListItem | undefined>();
  const handleOpenDialog = useCallback((item?: IWorkflowListItem) => {
    setItemSelectedForDialog(item);
    setDialogOpen(true);
  }, []);
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    // eslint-disable-next-line unicorn/no-useless-undefined
    setItemSelectedForDialog(undefined);
  }, []);
  const handleDialogAddWorkflow = useCallback(async (newItem: IWorkflowListItem, oldItem?: IWorkflowListItem) => {
    await onAddWorkflow(newItem, oldItem);
    handleCloseDialog();
  }, [handleCloseDialog, onAddWorkflow]);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTags(previous => previous.includes(tag) ? previous.filter(t => t !== tag) : [...previous, tag]);
  }, []);

  const filteredWorkflows = workflows
    .filter(workflow => search.length > 0 ? workflow.title.includes(search) : workflow)
    .filter(workflow => selectedTags.length > 0 ? selectedTags.some(tag => workflow.tags.includes(tag)) : workflow);

  return (
    <WorkflowManageContainer>
      <SimpleBar>
        <SearchRegionContainer>
          <SearchBar
            label='Search'
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setSearch(event.target.value);
            }}
          />
          <Stack direction='row' spacing={1}>
            {availableFilterTags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                clickable
                color={selectedTags.includes(tag) ? 'primary' : 'default'}
                onClick={() => {
                  handleTagClick(tag);
                }}
              />
            ))}
          </Stack>
        </SearchRegionContainer>
        <WorkflowList workflows={filteredWorkflows} onDeleteWorkflow={onDeleteWorkflow} handleOpenChangeMetadataDialog={handleOpenDialog} />
      </SimpleBar>
      <AddNewItemFloatingButton
        color='primary'
        aria-label='add'
        onClick={() => {
          handleOpenDialog();
        }}
      >
        <AddIcon />
      </AddNewItemFloatingButton>
      <AddItemDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onAdd={handleDialogAddWorkflow}
        availableFilterTags={availableFilterTags}
        workspacesList={workspacesList}
        item={itemSelectedForDialog}
      />
    </WorkflowManageContainer>
  );
};
