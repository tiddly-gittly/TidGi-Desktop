/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Autocomplete } from '@mui/lab';
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, Snackbar, TextField } from '@mui/material';
import { IWorkspaceWithMetadata } from '@services/workspaces/interface';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IWorkflowListItem } from './WorkflowList';

interface AddItemDialogProps {
  availableFilterTags: string[];
  onAdd: (newItem: IWorkflowListItem) => Promise<void>;
  onClose: () => void;
  open: boolean;
  workspacesList: IWorkspaceWithMetadata[] | undefined;
}

export const AddItemDialog: React.FC<AddItemDialogProps> = ({
  open,
  onClose,
  onAdd,
  availableFilterTags,
  workspacesList,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasError, setHasError] = useState(false);
  const [doneMessageSnackBarOpen, setDoneMessageSnackBarOpen] = useState(false);
  const [workspaceToSaveTo, setWorkspaceToSaveTo] = useState<IWorkspaceWithMetadata | undefined | null>(workspacesList?.[0]);
  useEffect(() => {
    // when list was undefined and change to have value, auto set default value once.
    if (workspaceToSaveTo === undefined && workspacesList?.[0]) {
      setWorkspaceToSaveTo(workspacesList?.[0]);
    }
  }, [workspaceToSaveTo, workspacesList]);
  const [tags, setTags] = useState<string[]>([]);
  const closeAndCleanup = useCallback(() => {
    setTitle('');
    setTags([]);
    onClose();
  }, [onClose]);
  const workspaceIDs = useMemo(() => workspacesList?.map(workspace => workspace.id) ?? [], [workspacesList]);
  const onSubmit = useCallback(async () => {
    const workspaceID = workspaceToSaveTo?.id ?? workspacesList?.[0]?.id;
    if (!workspaceID || !workspaceIDs.includes(workspaceID ?? '')) {
      console.error('No workspaceID found');
      setHasError(true);
      return;
    }
    if (!title) {
      setHasError(true);
      return;
    }
    const newItem: IWorkflowListItem = {
      id: `${workspaceID}:${title}`,
      title,
      tags,
      workspaceID,
      graphJSONString: '{}',
    };
    await onAdd(newItem);
    setDoneMessageSnackBarOpen(true);
    closeAndCleanup();
  }, [workspaceToSaveTo?.id, workspacesList, workspaceIDs, title, tags, onAdd, closeAndCleanup]);

  return (
    <>
      <Snackbar
        open={doneMessageSnackBarOpen}
        onClose={() => {
          setDoneMessageSnackBarOpen(false);
        }}
        autoHideDuration={3000}
        message={t('Workflow.AddNewWorkflowDoneMessage')}
        anchorOrigin={{ horizontal: 'center', vertical: 'top' }}
      />
      <Dialog open={open} onClose={closeAndCleanup}>
        <DialogTitle>{t('Workflow.AddNewWorkflow')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('Workflow.AddNewWorkflowDescription')}</DialogContentText>
          <FormControl fullWidth>
            <TextField
              required
              autoFocus
              margin='dense'
              label={t('Title')}
              type='text'
              fullWidth
              value={title}
              error={hasError && !title}
              onChange={event => {
                setTitle(event.target.value);
              }}
            />
            <TextField
              margin='dense'
              label={t('Description')}
              type='text'
              fullWidth
              value={description}
              onChange={event => {
                setDescription(event.target.value);
              }}
            />
            <Autocomplete
              multiple
              options={availableFilterTags}
              freeSolo
              value={tags}
              onChange={(event, newValue) => {
                setTags(newValue);
              }}
              renderInput={(parameters) => (
                <TextField
                  {...parameters}
                  label={`${t('Tags')} (${t('Workflow.AddTagsDescription')})`}
                  margin='dense'
                  onBlur={() => {
                    // add new tag from text in text input, no enter needed.
                    if (parameters.inputProps.value) {
                      const newValue = parameters.inputProps.value as string;
                      setTags(previousTags => [...previousTags.filter(tag => tag !== newValue), newValue]);
                    }
                  }}
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
              clearOnBlur
            />
            <Autocomplete
              options={workspacesList ?? []}
              value={workspaceToSaveTo}
              defaultValue={workspacesList?.[0]}
              onChange={(event, workspace) => {
                setWorkspaceToSaveTo(workspace);
              }}
              getOptionLabel={(workspace) => workspace.name}
              renderInput={(parameters) => (
                <TextField
                  {...parameters}
                  label={t('Workflow.BelongsToWorkspace')}
                  required
                  error={hasError && !workspaceToSaveTo}
                  margin='dense'
                />
              )}
            />
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAndCleanup}>{t('EditWorkspace.Cancel')}</Button>
          <Button
            onClick={onSubmit}
          >
            {t('WorkspaceSelector.Add')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
