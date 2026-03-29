import { Autocomplete, AutocompleteRenderInputParams, Button, List, MenuItem, Switch, TextField } from '@mui/material';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { useAvailableTags } from '../AddWorkspace/useAvailableTags';
import { Paper, SectionTitle } from '../Preferences/PreferenceComponents';
import { useWorkspaceForm } from './WorkspaceFormContext';

export function SubWorkspaceRouting(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation();
  const { sectionRef } = props;
  const { workspace: rawWorkspace, workspaceSetter: rawSetter } = useWorkspaceForm();
  const workspace = rawWorkspace;
  const workspaceSetter = rawSetter as (ws: IWikiWorkspace, needsRestart?: boolean) => void;
  const [tagInputValue, setTagInputValue] = useState<string>('');

  const {
    isSubWiki,
    tagNames,
    includeTagTree,
    fileSystemPathFilterEnable,
    fileSystemPathFilter,
    ignoreSymlinks,
  } = workspace;

  const tagHelperText = tagInputValue.trim().length > 0
    ? t('AddWorkspace.TagNameInputWarning')
    : (isSubWiki ? t('AddWorkspace.TagNameHelp') : t('AddWorkspace.TagNameHelpForMain'));

  const mainWorkspaceList = usePromiseValue(
    async () => {
      const workspaces = await window.service.workspace.getWorkspacesAsList();
      return workspaces.filter(
        (candidate): candidate is IWikiWorkspace => isWikiWorkspace(candidate) && !candidate.isSubWiki && candidate.id !== workspace.id,
      );
    },
    [],
    [workspace.id],
  ) ?? [];
  const boundSubWorkspaces = usePromiseValue(
    async () => {
      if (isSubWiki) {
        return [];
      }
      return await window.service.workspace.getSubWorkspacesAsList(workspace.id);
    },
    [],
    [workspace.id, isSubWiki],
  ) ?? [];
  const selectedMainWorkspace = mainWorkspaceList.find(
    (candidate) => candidate.id === workspace.mainWikiID || candidate.wikiFolderLocation === workspace.mainWikiToLink,
  );

  // Auto-show section ref when there's relevant content (same logic used to expand accordion before)
  const availableTags = useAvailableTags(workspace.mainWikiID ?? undefined, true);
  return (
    <>
      <SectionTitle ref={sectionRef}>{t('AddWorkspace.SubWorkspaceOptions')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          <ListItem
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={isSubWiki}
                data-testid='is-sub-workspace-switch'
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, isSubWiki: event.target.checked }, true);
                }}
              />
            }
          >
            <ListItemText
              primary={t('EditWorkspace.IsSubWorkspace')}
              secondary={t('EditWorkspace.IsSubWorkspaceDescription')}
            />
          </ListItem>
          {!isSubWiki && boundSubWorkspaces.length > 0 && (
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
          )}
          {isSubWiki && (
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
          )}
          <ListItem>
            <ListItemText
              secondary={isSubWiki ? t('AddWorkspace.SubWorkspaceOptionsDescriptionForSub') : t('AddWorkspace.SubWorkspaceOptionsDescriptionForMain')}
            />
          </ListItem>
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
          <ListItem
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={includeTagTree}
                data-testid='include-tag-tree-switch'
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, includeTagTree: event.target.checked }, true);
                }}
              />
            }
          >
            <ListItemText
              primary={t('AddWorkspace.IncludeTagTree')}
              secondary={isSubWiki ? t('AddWorkspace.IncludeTagTreeHelp') : t('AddWorkspace.IncludeTagTreeHelpForMain')}
            />
          </ListItem>
          <ListItem
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={fileSystemPathFilterEnable}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, fileSystemPathFilterEnable: event.target.checked }, true);
                }}
              />
            }
          >
            <ListItemText
              primary={t('AddWorkspace.UseFilter')}
              secondary={t('AddWorkspace.UseFilterHelp')}
            />
          </ListItem>
          <ListItem
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={ignoreSymlinks}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, ignoreSymlinks: event.target.checked }, true);
                }}
              />
            }
          >
            <ListItemText
              primary={t('EditWorkspace.IgnoreSymlinks')}
              secondary={t('EditWorkspace.IgnoreSymlinksDescription')}
            />
          </ListItem>
          {fileSystemPathFilterEnable && (
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
          )}
        </List>
      </Paper>
    </>
  );
}
