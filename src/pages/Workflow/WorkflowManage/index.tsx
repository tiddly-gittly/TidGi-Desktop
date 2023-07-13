import AddIcon from '@mui/icons-material/Add';
import { Autocomplete } from '@mui/lab';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Fab, InputLabel, Stack, TextField } from '@mui/material';
import React, { ChangeEvent, useCallback, useState } from 'react';
import { IWorkflowListItem, WorkflowList } from './WorkflowList';

export const WorkflowManage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<IWorkflowListItem[]>([]);
  const [availableFilterTags, setAvailableFilterTags] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newWorkflowTitle, setNewWorkflowTitle] = useState('');
  const [newWorkflowTags, setNewWorkflowTags] = useState<string[]>([]);

  const handleOpenDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);
  const onAddWorkflow = useCallback((newItem: IWorkflowListItem) => {}, []);

  const handleAddWorkflow = useCallback(() => {
    onAddWorkflow({
      id: Math.floor(Math.random() * 10_000), // Generate a random id, replace this with proper id
      title: newWorkflowTitle,
      tags: newWorkflowTags,
    });
    setDialogOpen(false);
    setNewWorkflowTitle('');
    setNewWorkflowTags([]);
  }, [newWorkflowTitle, newWorkflowTags, onAddWorkflow]);

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
      <Fab color='primary' aria-label='add' onClick={handleOpenDialog}>
        <AddIcon />
      </Fab>
      <Dialog open={dialogOpen} onClose={handleCloseDialog}>
        <DialogTitle>Add Workflow</DialogTitle>
        <DialogContent>
          <DialogContentText>Add a new workflow to your list</DialogContentText>
          <TextField
            autoFocus
            margin='dense'
            label='Title'
            type='text'
            fullWidth
            value={newWorkflowTitle}
            onChange={event => {
              setNewWorkflowTitle(event.target.value);
            }}
          />
          <InputLabel>Add Tags</InputLabel>
          <Autocomplete
            multiple
            options={availableFilterTags}
            freeSolo
            value={newWorkflowTags}
            onChange={(event, newValue) => {
              setNewWorkflowTags(newValue);
            }}
            renderInput={(parameters) => (
              <TextField
                {...parameters}
                variant='standard'
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={option}
                  {...getTagProps({ index })}
                  key={option}
                />
              ))}
            onInputChange={(event, newInputValue) => {
              setNewWorkflowTags(previous => [...previous, newInputValue]);
            }}
            onBlur={() => {
              setNewWorkflowTags(previous => previous.filter(tag => tag !== ''));
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleAddWorkflow}>Add</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
