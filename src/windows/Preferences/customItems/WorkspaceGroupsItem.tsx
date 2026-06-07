import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import { Autocomplete, Box, Button, Chip, Divider, IconButton, TextField, Typography } from '@mui/material';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { useWorkspaceGroupsListObservable, useWorkspacesListObservable } from '@services/workspaces/hooks';
import type { IWorkspace, IWorkspaceGroup } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  const wikiWorkspaces = useMemo(() => workspaces.filter(isWikiWorkspace), [workspaces]);

  const createGroup = useCallback(async () => {
    const trimmedName = newGroupName.trim();
    if (!trimmedName) return;

    const ungroupedWikiWorkspaces = wikiWorkspaces.filter(workspace => !workspace.groupId);
    const maxUngroupedOrder = ungroupedWikiWorkspaces.reduce((maxOrder, workspace) => Math.max(maxOrder, workspace.order ?? 0), -1);
    const nextGroupOrder = Math.max(maxUngroupedOrder + groups.length + 1, groups.length);

    const newGroup: IWorkspaceGroup = {
      id: nanoid(),
      name: trimmedName,
      order: nextGroupOrder,
      collapsed: false,
    };
    await window.service.workspace.setGroup(newGroup.id, newGroup);
    setNewGroupName('');
  }, [groups.length, newGroupName, wikiWorkspaces]);

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

  const isSyncingReference = useRef(false);
  const syncGroupMembership = useCallback(async (groupId: string, selectedWorkspaces: IWorkspace[]) => {
    if (isSyncingReference.current) return;
    isSyncingReference.current = true;
    try {
      const currentGroupMembers = wikiWorkspaces.filter(workspace => workspace.groupId === groupId);
      const currentIds = new Set(currentGroupMembers.map(workspace => workspace.id));
      const selectedIds = new Set(selectedWorkspaces.map(workspace => workspace.id));

      await Promise.all(
        currentGroupMembers
          .filter(workspace => !selectedIds.has(workspace.id))
          .map(workspace => window.service.workspace.moveWorkspaceToGroup(workspace.id, null, false)),
      );

      await Promise.all(
        selectedWorkspaces
          .filter(workspace => !currentIds.has(workspace.id))
          .map(workspace => window.service.workspace.moveWorkspaceToGroup(workspace.id, groupId)),
      );
    } finally {
      isSyncingReference.current = false;
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
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void saveGroupName(group);
                          } else if (event.key === 'Escape') {
                            setEditingGroupId(null);
                            setEditingName('');
                          }
                        }}
                        onBlur={() => {
                          void saveGroupName(group);
                        }}
                      />
                    )
                    : (
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant='body2' sx={{ fontWeight: 500 }}>
                          {group.name}
                        </Typography>
                        <Typography variant='caption' sx={{
                          color: 'text.secondary'
                        }}>
                          {t('WorkspaceGroup.WorkspaceCount', { count: workspacesInGroup.length })}
                        </Typography>
                      </Box>
                    )}
                  {isEditing
                    ? (
                      <>
                        <IconButton
                          size='small'
                          onClick={() => {
                            void saveGroupName(group);
                          }}
                          data-testid={`save-group-${group.id}`}
                        >
                          <CheckIcon fontSize='small' />
                        </IconButton>
                        <IconButton
                          size='small'
                          onClick={() => {
                            setEditingGroupId(null);
                            setEditingName('');
                          }}
                          data-testid={`cancel-edit-group-${group.id}`}
                        >
                          <CloseIcon fontSize='small' />
                        </IconButton>
                      </>
                    )
                    : (
                      <>
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
                      </>
                    )}
                </Box>

                <Autocomplete
                  multiple
                  fullWidth
                  options={availableWorkspaces}
                  value={workspacesInGroup}
                  getOptionLabel={(workspace) => workspace.name ?? workspace.id ?? ''}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  filterSelectedOptions
                  renderValue={(value) =>
                    value.map((workspace) => (
                      <Chip
                        variant='outlined'
                        size='small'
                        label={workspace.name}
                        key={workspace.id}
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
