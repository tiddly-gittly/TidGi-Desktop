import AddIcon from '@mui/icons-material/Add';
import { Box, Chip, Fab, Stack, TextField, Tooltip } from '@mui/material';
import { useWorkspacesListObservable } from '@services/workspaces/hooks';
import React, { ChangeEvent, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SimpleBar from 'simplebar-react';
import styled from 'styled-components';

import { AddItemDialog } from './AddItemDialog';
import { AgentList, IAgentListItem } from './AgentsList';
import { useAgents, useAvailableFilterTags } from './useAgentDataSource';
import { useHandleOpenInTheGraphEditor } from './useClickHandler';

const AgentManageContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  margin: 1em;
  margin-top: 0;

  width: 100%;
  height: 100vh;
  overflow: auto;
`;
const SearchRegionContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  padding-top: 1em;
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

export const AgentsManage: React.FC = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedIncludedTags, setSelectedIncludedTags] = useState<string[]>([]);
  const [selectedExcludedTags, setSelectedExcludedTags] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const workspacesList = useWorkspacesListObservable();
  const [availableFilterTags, setTagsByWorkspace] = useAvailableFilterTags(workspacesList);
  const [agents, onAddAgent, onDeleteAgent] = useAgents(workspacesList, setTagsByWorkspace);

  const [itemSelectedForDialog, setItemSelectedForDialog] = useState<IAgentListItem | undefined>();
  const handleOpenDialog = useCallback((item?: IAgentListItem) => {
    setItemSelectedForDialog(item);
    setDialogOpen(true);
  }, []);
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);

    setItemSelectedForDialog(undefined);
  }, []);
  const handleOpenInTheGraphEditor = useHandleOpenInTheGraphEditor();
  const handleDialogAddAgent = useCallback(async (newItem: IAgentListItem, oldItem?: IAgentListItem) => {
    await onAddAgent(newItem, oldItem);
    handleOpenInTheGraphEditor(newItem);
    handleCloseDialog();
  }, [handleCloseDialog, handleOpenInTheGraphEditor, onAddAgent]);

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

  const filteredAgents = agents
    .filter(agent => search.length > 0 ? agent.title.includes(search) : agent)
    .filter(agent => selectedIncludedTags.length > 0 ? selectedIncludedTags.some(tag => agent.tags.includes(tag)) : agent)
    .filter(agent => selectedExcludedTags.length > 0 ? selectedExcludedTags.every(tag => !agent.tags.includes(tag)) : agent);

  return (
    <AgentManageContainer>
      <SimpleBar>
        <SearchRegionContainer>
          <SearchBar
            label={t('Agent.SearchAgents')}
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setSearch(event.target.value);
            }}
          />
          <Stack direction='row' spacing={1}>
            {availableFilterTags.map(tag => {
              const tooltip = selectedIncludedTags.includes(tag)
                ? t('Agent.FilteringIncludeClickToExclude')
                : (selectedExcludedTags.includes(tag) ? t('Agent.FilteringExcludeClickToRemove') : t('Agent.NotFilteringClickToInclude'));
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
        <AgentList agents={filteredAgents} onDeleteAgent={onDeleteAgent} handleOpenChangeMetadataDialog={handleOpenDialog} />
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
        onAdd={handleDialogAddAgent}
        availableFilterTags={availableFilterTags}
        workspacesList={workspacesList}
        item={itemSelectedForDialog}
      />
    </AgentManageContainer>
  );
};
