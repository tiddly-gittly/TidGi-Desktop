import { Autocomplete, AutocompleteRenderInputParams, Button, MenuItem, TextField } from '@mui/material';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { useAvailableTags } from '../../AddWorkspace/useAvailableTags';
import { useWorkspaceForm } from '../WorkspaceFormContext';

export function SubWikiBoundWorkspacesItem(_props: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace } = useWorkspaceForm();
  const { isSubWiki, id } = workspace;

  const boundSubWorkspaces = usePromiseValue(
    async () => {
      if (isSubWiki) return [];
      return await window.service.workspace.getSubWorkspacesAsList(id);
    },
    [],
    [id, isSubWiki],
  ) ?? [];

  if (isSubWiki || boundSubWorkspaces.length === 0) return null;

  return (
    <>
      <ListItem>
        <ListItemText
          primary={t('EditWorkspace.BoundSubWorkspacesTitle')}
          secondary={t('EditWorkspace.BoundSubWorkspacesDescription')}
        />
      </ListItem>
      {boundSubWorkspaces.map((subWorkspace) => (
        <ListItem
          key={subWorkspace.id}
          data-testid='bound-sub-workspace-row'
          secondaryAction={
            <Button
              data-testid='open-sub-workspace-settings-button'
              size='small'
              variant='outlined'
              onClick={() => {
                void window.service.window.open(WindowNames.editWorkspace, { workspaceID: subWorkspace.id }, { multiple: true });
              }}
            >
              {t('EditWorkspace.OpenSubWorkspaceSettings')}
            </Button>
          }
        >
          <ListItemText
            sx={{ pr: 14 }}
            primary={subWorkspace.name}
            secondary={subWorkspace.tagNames.length > 0
              ? `${t('EditWorkspace.SubWorkspaceTagBindings')}: ${subWorkspace.tagNames.join(', ')}`
              : t('EditWorkspace.SubWorkspaceNoTagBindings')}
          />
        </ListItem>
      ))}
    </>
  );
}

export function SubWikiMainWorkspaceItem(_props: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { isSubWiki, id } = workspace;

  const mainWorkspaceList = usePromiseValue(
    async () => {
      const workspaces = await window.service.workspace.getWorkspacesAsList();
      return workspaces.filter(
        (candidate): candidate is IWikiWorkspace => isWikiWorkspace(candidate) && !candidate.isSubWiki && candidate.id !== id,
      );
    },
    [],
    [id],
  ) ?? [];

  if (!isSubWiki) return null;

  const selectedMainWorkspace = mainWorkspaceList.find(
    (candidate) => candidate.id === workspace.mainWikiID || candidate.wikiFolderLocation === workspace.mainWikiToLink,
  );

  return (
    <ListItem>
      <TextField
        select
        data-testid='main-wiki-select'
        fullWidth
        label={t('AddWorkspace.MainWorkspaceLocation')}
        helperText={selectedMainWorkspace?.wikiFolderLocation
          ? `${t('AddWorkspace.SubWorkspaceWillLinkTo')} ${selectedMainWorkspace.wikiFolderLocation}`
          : undefined}
        value={selectedMainWorkspace?.id ?? ''}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const nextMainWorkspace = mainWorkspaceList.find((candidate) => candidate.id === event.target.value) ?? null;
          workspaceSetter({
            ...workspace,
            mainWikiID: nextMainWorkspace?.id ?? null,
            mainWikiToLink: nextMainWorkspace?.wikiFolderLocation ?? null,
          }, true);
        }}
      >
        {mainWorkspaceList.map((candidate) => (
          <MenuItem key={candidate.id} value={candidate.id}>
            {candidate.name}
          </MenuItem>
        ))}
      </TextField>
    </ListItem>
  );
}

export function SubWikiTagDescriptionItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace } = useWorkspaceForm();
  const { isSubWiki } = workspace;

  return (
    <ListItem>
      <ListItemText
        secondary={isSubWiki ? t('AddWorkspace.SubWorkspaceOptionsDescriptionForSub') : t('AddWorkspace.SubWorkspaceOptionsDescriptionForMain')}
      />
    </ListItem>
  );
}

export function SubWikiTagNamesItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { isSubWiki, tagNames, mainWikiID } = workspace;
  const [tagInputValue, setTagInputValue] = useState<string>('');
  const availableTags = useAvailableTags(mainWikiID ?? undefined, true);
  const tagHelperText = tagInputValue.trim().length > 0
    ? t('AddWorkspace.TagNameInputWarning')
    : (isSubWiki ? t('AddWorkspace.TagNameHelp') : t('AddWorkspace.TagNameHelpForMain'));

  return (
    <ListItem>
      <Autocomplete
        multiple
        freeSolo
        fullWidth
        options={availableTags}
        value={tagNames}
        onInputChange={(_event: React.SyntheticEvent, newInputValue: string) => {
          setTagInputValue(newInputValue);
        }}
        onChange={(_event: React.SyntheticEvent, newValue: string[]) => {
          void _event;
          workspaceSetter({ ...workspace, tagNames: newValue }, true);
          setTagInputValue('');
        }}
        slotProps={{
          chip: {
            variant: 'outlined',
          },
        }}
        renderInput={(parameters: AutocompleteRenderInputParams) => (
          <TextField
            {...parameters}
            label={t('AddWorkspace.TagName')}
            helperText={tagHelperText}
          />
        )}
      />
    </ListItem>
  );
}

export function SubWikiFileSystemPathFilterItem(_props: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { fileSystemPathFilterEnable, fileSystemPathFilter } = workspace;
  if (!fileSystemPathFilterEnable) return null;

  return (
    <ListItem>
      <TextField
        fullWidth
        multiline
        minRows={2}
        maxRows={10}
        value={fileSystemPathFilter ?? ''}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          workspaceSetter({ ...workspace, fileSystemPathFilter: event.target.value || null }, true);
        }}
        label={t('AddWorkspace.FilterExpression')}
        helperText={t('AddWorkspace.FilterExpressionHelp')}
      />
    </ListItem>
  );
}
