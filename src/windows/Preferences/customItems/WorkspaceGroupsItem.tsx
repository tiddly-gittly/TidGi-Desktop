import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import { Autocomplete, Box, Button, Chip, Divider, IconButton, TextField, Typography } from '@mui/material';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { useWorkspaceGroupsListObservable, useWorkspacesListObservable } from '@services/workspaces/hooks';
import type { IWorkspace, IWorkspaceGroup } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';

export function WorkspaceGroupsItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const groups = useWorkspaceGroupsListObservable() ?? [];
  const workspaces = useWorkspacesListObservable() ?? [];
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    if (editingGroupId !== null && !groups.some(group => group.id === editingGroupId)) {
      setEditingGroupId(null);
      setEditingName('');
    }
  }, [groups, editingGroupId]);

  const wikiWorkspaces = workspaces.filter(isWikiWorkspace);

  const createGroup = useCallback(async () => {
    const trimmedName = newGroupName.trim();
    if (!trimmedName) return;

    const newGroup: IWorkspaceGroup = {
      id: nanoid(),
      name: trimmedName,
      order: groups.length,
      collapsed: false,
    };
    await window.service.workspace.setGroup(newGroup.id, newGroup);
    setNewGroupName('');
  }, [newGroupName, groups.length]);

  const saveGroupName = useCallback(async (group: IWorkspaceGroup) => {
    const trimmedName = editingName.trim();
    if (!trimmedName) return;

    await window.service.workspace.setGroup(group.id, { ...group, name: trimmedName });
    setEditingGroupId(null);
    setEditingName('');
  }, [editingName]);

  const deleteGroup = useCallback(async (group: IWorkspaceGroup) => {
    const confirmed = await window.service.native.showElectronMessageBox({
      type: 'question',
      buttons: [t('Confirm'), t('Cancel')],
      message: t('WorkspaceGroup.DeleteGroupConfirm', { groupName: group.name }),
      cancelId: 1,
    });
    if (confirmed?.response === 0) {
      await window.service.workspace.removeGroup(group.id);
    }
  }, [t]);

  const syncGroupMembership = useCallback(async (groupId: string, selectedWorkspaces: IWorkspace[]) => {
    const currentGroupMembers = wikiWorkspaces.filter(workspace => workspace.groupId === groupId);
    const currentIds = new Set(currentGroupMembers.map(workspace => workspace.id));
    const selectedIds = new Set(selectedWorkspaces.map(workspace => workspace.id));

    for (const workspace of currentGroupMembers) {
      if (!selectedIds.has(workspace.id)) {
        await window.service.workspace.moveWorkspaceToGroup(workspace.id, null, false);
      }
    }

    for (const workspace of selectedWorkspaces) {
      if (!currentIds.has(workspace.id)) {
        await window.service.workspace.moveWorkspaceToGroup(workspace.id, groupId);
      }
    }
  }, [wikiWorkspaces]);

  return (
    <>
      <ListItem>
        <ListItemText primary={t('WorkspaceGroup.ManageGroups')} secondary={t('WorkspaceGroup.ManageGroupsDescription')} />
      </ListItem>

      <ListItem sx={{ alignItems: 'flex-start', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          fullWidth
          size='small'
          value={newGroupName}
          label={t('WorkspaceGroup.CreateGroup')}
          placeholder={t('WorkspaceGroup.GroupName')}
          onChange={(event) => {
            setNewGroupName(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void createGroup();
            }
          }}
        />
        <Box sx={{ alignSelf: 'flex-end' }}>
          <Button
            size='small'
            startIcon={<AddIcon />}
            onClick={() => {
              void createGroup();
            }}
            data-testid='create-group-button'
          >
            {t('WorkspaceGroup.CreateGroup')}
          </Button>
        </Box>
      </ListItem>

      <Divider />

      {groups.length === 0
        ? (
          <ListItem>
            <ListItemText secondary={t('WorkspaceGroup.ManageGroupsDescription')} />
          </ListItem>
        )
        : groups.map((group, index) => {
          const workspacesInGroup = wikiWorkspaces.filter(workspace => workspace.groupId === group.id);
          const availableWorkspaces = wikiWorkspaces.filter(workspace => workspace.groupId !== group.id);
          const isEditing = editingGroupId === group.id;

          return (
            <Box key={group.id} data-testid={`group-management-item-${group.id}`}>
              {index > 0 && <Divider />}
              <ListItem sx={{ alignItems: 'flex-start', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FolderIcon fontSize='small' color='action' />
                  {isEditing
                    ? (
                      <TextField
                        autoFocus
                        fullWidth
                        size='small'
                        label={t('WorkspaceGroup.GroupName')}
                        value={editingName}
                        onChange={(event) => {
                          setEditingName(event.target.value);
                        }}
                        onBlur={() => {
                          void saveGroupName(group);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void saveGroupName(group);
                          } else if (event.key === 'Escape') {
                            setEditingGroupId(null);
                            setEditingName('');
                          }
                        }}
                      />
                    )
                    : (
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant='body2' sx={{ fontWeight: 500 }}>
                          {group.name}
                        </Typography>
                        <Typography variant='caption' color='text.secondary'>
                          {t('WorkspaceGroup.WorkspaceCount', { count: workspacesInGroup.length })}
                        </Typography>
                      </Box>
                    )}
                  <IconButton
                    size='small'
                    onClick={() => {
                      setEditingGroupId(group.id);
                      setEditingName(group.name);
                    }}
                    data-testid={`edit-group-${group.id}`}
                  >
                    <EditIcon fontSize='small' />
                  </IconButton>
                  <IconButton
                    size='small'
                    onClick={() => {
                      void deleteGroup(group);
                    }}
                    data-testid={`delete-group-${group.id}`}
                  >
                    <DeleteIcon fontSize='small' />
                  </IconButton>
                </Box>

                <Autocomplete
                  multiple
                  fullWidth
                  options={availableWorkspaces}
                  value={workspacesInGroup}
                  getOptionLabel={(workspace) => workspace.name}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  filterSelectedOptions
                  renderValue={(value, getItemProps) =>
                    value.map((workspace, tagIndex) => (
                      <Chip
                        variant='outlined'
                        size='small'
                        label={workspace.name}
                        {...getItemProps({ index: tagIndex })}
                      />
                    ))}
                  renderInput={(parameters) => (
                    <TextField
                      {...parameters}
                      label={t('WorkspaceGroup.AddWorkspaces')}
                      placeholder={t('WorkspaceGroup.SearchWorkspace')}
                      size='small'
                    />
                  )}
                  onChange={(_event, newValue) => {
                    void syncGroupMembership(group.id, newValue);
                  }}
                />
              </ListItem>
            </Box>
          );
        })}
    </>
  );
}
