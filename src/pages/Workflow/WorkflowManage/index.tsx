import AddIcon from '@mui/icons-material/Add';
import { Box, Chip, Fab, Stack, TextField } from '@mui/material';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import React, { ChangeEvent, useCallback, useState } from 'react';
import styled from 'styled-components';

import { AddItemDialog } from './AddItemDialog';
import { useAvailableFilterTags, useWorkflows } from './useWorkflowDataSource';
import { IWorkflowListItem, WorkflowList } from './WorkflowList';

const WorkflowManageContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  margin: 1em;
`;
const SearchRegionContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  margin-bottom: 1em;
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

  const handleOpenDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);
  const handleDialogAddWorkflow = useCallback(async (newItem: IWorkflowListItem) => {
    await onAddWorkflow(newItem);
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
      <WorkflowList workflows={filteredWorkflows} onDeleteWorkflow={onDeleteWorkflow} />
      <AddNewItemFloatingButton color='primary' aria-label='add' onClick={handleOpenDialog}>
        <AddIcon />
      </AddNewItemFloatingButton>
      <AddItemDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onAdd={handleDialogAddWorkflow}
        availableFilterTags={availableFilterTags}
        workspacesList={workspacesList}
      />
    </WorkflowManageContainer>
  );
};
