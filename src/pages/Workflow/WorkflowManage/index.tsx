import AddIcon from '@mui/icons-material/Add';
import { Box, Chip, Fab, Stack, TextField } from '@mui/material';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import React, { ChangeEvent, useCallback, useState } from 'react';
import styled from 'styled-components';

import { AddItemDialog } from './AddItemDialog';
import { useAvailableFilterTags, useWorkflows } from './useWorkflowDataSource';
import { IWorkflowListItem, WorkflowList } from './WorkflowList';

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
  const [availableFilterTags] = useAvailableFilterTags(workspacesList);
  const [workflows, onAddWorkflow] = useWorkflows(workspacesList);

  const handleOpenDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);
  const handleDialogAddWorkflow = useCallback((newItem: IWorkflowListItem) => {
    onAddWorkflow(newItem);
    handleCloseDialog();
  }, [handleCloseDialog, onAddWorkflow]);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTags(previous => previous.includes(tag) ? previous.filter(t => t !== tag) : [...previous, tag]);
  }, []);

  const filteredWorkflows = workflows
    .filter(workflow => workflow.title.includes(search))
    .filter(workflow => selectedTags.some(tag => workflow.tags.includes(tag)));

  return (
    <Box>
      <TextField
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
      <WorkflowList workflows={filteredWorkflows} />
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
    </Box>
  );
};
