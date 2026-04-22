import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemIcon, ListItemText, TextField } from '@mui/material';
import { useWorkspaceGroupsListObservable } from '@services/workspaces/hooks';
import type { IWorkspaceGroup } from '@services/workspaces/interface';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface WorkspaceGroupManagementProps {
  onClose: () => void;
  open: boolean;
}

export function WorkspaceGroupManagement({ open, onClose }: WorkspaceGroupManagementProps): React.JSX.Element {
  const { t } = useTranslation();
  const groups = useWorkspaceGroupsListObservable() ?? [];
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;
    const newGroup: IWorkspaceGroup = {
      id: nanoid(),
      name: newGroupName.trim(),
      order: groups.length,
      collapsed: false,
    };
    await window.service.workspace.setGroup(newGroup.id, newGroup);
    setNewGroupName('');
    setIsCreating(false);
  }, [newGroupName, groups.length]);

  const handleStartEdit = useCallback((group: IWorkspaceGroup) => {
    setEditingGroupId(group.id);
    setEditingName(group.name);
  }, []);

  const handleSaveEdit = useCallback(async (group: IWorkspaceGroup) => {
    if (!editingName.trim()) return;
    await window.service.workspace.setGroup(group.id, { ...group, name: editingName.trim() });
    setEditingGroupId(null);
    setEditingName('');
  }, [editingName]);

  const handleCancelEdit = useCallback(() => {
    setEditingGroupId(null);
    setEditingName('');
  }, []);

  const handleDeleteGroup = useCallback(async (group: IWorkspaceGroup) => {
    const confirmed = await window.service.native.showElectronMessageBox({
      type: 'question',
      buttons: [t('Dialog.OK'), t('Dialog.Cancel')],
      message: t('WorkspaceGroup.DeleteGroupConfirm', { groupName: group.name }),
      cancelId: 1,
    });
    if (confirmed?.response === 0) {
      await window.service.workspace.removeGroup(group.id);
    }
  }, [t]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('WorkspaceGroup.ManageGroups')}</DialogTitle>
      <DialogContent>
        <List>
          {groups.map((group) => (
            <ListItem
              key={group.id}
              data-testid={`group-management-item-${group.id}`}
              secondaryAction={
                <>
                  {editingGroupId === group.id
                    ? (
                      <>
                        <Button size='small' onClick={() => handleSaveEdit(group)}>
                          {t('Dialog.OK')}
                        </Button>
                        <Button size='small' onClick={handleCancelEdit}>
                          {t('Dialog.Cancel')}
                        </Button>
                      </>
                    )
                    : (
                      <>
                        <IconButton
                          edge='end'
                          onClick={() => {
                            handleStartEdit(group);
                          }}
                          data-testid={`edit-group-${group.id}`}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton edge='end' onClick={() => handleDeleteGroup(group)} data-testid={`delete-group-${group.id}`}>
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                </>
              }
            >
              <ListItemIcon>
                <FolderIcon />
              </ListItemIcon>
              {editingGroupId === group.id
                ? (
                  <TextField
                    value={editingName}
                    onChange={(event) => {
                      setEditingName(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleSaveEdit(group);
                      } else if (event.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    autoFocus
                    fullWidth
                    size='small'
                  />
                )
                : <ListItemText primary={group.name} />}
            </ListItem>
          ))}
          {isCreating
            ? (
              <ListItem>
                <ListItemIcon>
                  <FolderIcon />
                </ListItemIcon>
                <TextField
                  value={newGroupName}
                  onChange={(event) => {
                    setNewGroupName(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleCreateGroup();
                    } else if (event.key === 'Escape') {
                      setIsCreating(false);
                      setNewGroupName('');
                    }
                  }}
                  placeholder={t('WorkspaceGroup.GroupName')}
                  autoFocus
                  fullWidth
                  size='small'
                />
                <Button size='small' onClick={handleCreateGroup}>
                  {t('Dialog.OK')}
                </Button>
                <Button
                  size='small'
                  onClick={() => {
                    setIsCreating(false);
                    setNewGroupName('');
                  }}
                >
                  {t('Dialog.Cancel')}
                </Button>
              </ListItem>
            )
            : (
              <ListItem>
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setIsCreating(true);
                  }}
                  data-testid='create-group-button'
                >
                  {t('WorkspaceGroup.CreateGroup')}
                </Button>
              </ListItem>
            )}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Dialog.Close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
