import AddIcon from '@mui/icons-material/Add';
import { Box, Chip, Fab, Stack, TextField, Tooltip } from '@mui/material';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import React, { ChangeEvent, useCallback, useState } from 'react';
import SimpleBar from 'simplebar-react';
import styled from 'styled-components';

import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedIncludedTags, setSelectedIncludedTags] = useState<string[]>([]);
  const [selectedExcludedTags, setSelectedExcludedTags] = useState<string[]>([]);
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
    // if included, set it as excluded
    if (selectedIncludedTags.includes(tag)) {
      setSelectedIncludedTags(previous => previous.includes(tag) ? previous.filter(t => t !== tag) : [...previous, tag]);
      setSelectedExcludedTags(previous => previous.includes(tag) ? previous.filter(t => t !== tag) : [...previous, tag]);
    } else if (selectedExcludedTags.includes(tag)) {
      // if excluded, set as normal
      setSelectedExcludedTags(previous => previous.includes(tag) ? previous.filter(t => t !== tag) : [...previous, tag]);
    } else {
      // if normal, set as included
      setSelectedIncludedTags(previous => previous.includes(tag) ? previous.filter(t => t !== tag) : [...previous, tag]);
    }
  }, [selectedIncludedTags, selectedExcludedTags]);

  const filteredWorkflows = workflows
    .filter(workflow => search.length > 0 ? workflow.title.includes(search) : workflow)
    .filter(workflow => selectedIncludedTags.length > 0 ? selectedIncludedTags.some(tag => workflow.tags.includes(tag)) : workflow)
    .filter(workflow => selectedExcludedTags.length > 0 ? selectedExcludedTags.every(tag => !workflow.tags.includes(tag)) : workflow);

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
            {availableFilterTags.map(tag => {
              const tooltip = selectedIncludedTags.includes(tag)
                ? t('Workflow.FilteringIncludeClickToExclude')
                : (selectedExcludedTags.includes(tag) ? t('Workflow.FilteringExcludeClickToRemove') : t('Workflow.NotFilteringClickToInclude'));
              const color = selectedIncludedTags.includes(tag) ? 'primary' : (selectedExcludedTags.includes(tag) ? 'warning' : 'default');
              return (
                <Tooltip title={tooltip} key={tag}>
                  <Chip
                    label={tag}
                    clickable
                    color={color}
                    onClick={() => {
                      handleTagClick(tag);
                    }}
                  />
                </Tooltip>
              );
            })}
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
