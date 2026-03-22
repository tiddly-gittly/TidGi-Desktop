import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AccordionDetails, Autocomplete, AutocompleteRenderInputParams, Button, List, ListItem, ListItemText, MenuItem, Switch, Tooltip, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { WindowNames } from '@services/windows/WindowProperties';
import type { IWikiWorkspace } from '@services/workspaces/interface';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { useAvailableTags } from '../AddWorkspace/useAvailableTags';
import { OptionsAccordion, OptionsAccordionSummary, TextField } from './styles';

interface SubWorkspaceRoutingProps {
  workspace: IWikiWorkspace;
  workspaceSetter: (newValue: IWikiWorkspace, requestSaveAndRestart?: boolean) => void;
  showDetails: boolean;
}

export function SubWorkspaceRouting(props: SubWorkspaceRoutingProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter, showDetails } = props;
  const [tagInputValue, setTagInputValue] = useState<string>('');
  const [accordionExpanded, setAccordionExpanded] = useState(false);

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

  // Auto-expand when there's relevant content to show (bound sub-wikis or sub-wiki is editing its own settings)
  useEffect(() => {
    if (showDetails && (isSubWiki || boundSubWorkspaces.length > 0)) {
      setAccordionExpanded(true);
    }
  }, [showDetails, isSubWiki, boundSubWorkspaces.length]);

  const availableTags = useAvailableTags(workspace.mainWikiID ?? undefined, true);
  return (
    <OptionsAccordion
      expanded={accordionExpanded}
      onChange={(_, expanded) => {
        setAccordionExpanded(expanded);
      }}
    >
      <Tooltip title={t('EditWorkspace.ClickToExpand')}>
        <OptionsAccordionSummary expandIcon={<ExpandMoreIcon />} data-testid='preference-section-subWorkspaceOptions'>
          {t('AddWorkspace.SubWorkspaceOptions')}
        </OptionsAccordionSummary>
      </Tooltip>
      <AccordionDetails>
        <List disablePadding>
          <ListItem
            disableGutters
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
        </List>
        {showDetails && (
          <>
            {!isSubWiki && boundSubWorkspaces.length > 0 && (
              <>
                <Typography variant='subtitle2' sx={{ mt: 1, mb: 0.5 }}>
                  {t('EditWorkspace.BoundSubWorkspacesTitle')}
                </Typography>
                <Typography variant='body2' color='textSecondary' sx={{ mb: 1 }}>
                  {t('EditWorkspace.BoundSubWorkspacesDescription')}
                </Typography>
                <List sx={{ mb: 2 }}>
                  {boundSubWorkspaces.map((subWorkspace) => (
                    <ListItem
                      key={subWorkspace.id}
                      disableGutters
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
                </List>
              </>
            )}
            {isSubWiki && (
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
                sx={{ mb: 2 }}
              >
                {mainWorkspaceList.map((candidate) => (
                  <MenuItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Typography variant='body2' color='textSecondary' sx={{ mt: 1, mb: 2 }}>
              {isSubWiki ? t('AddWorkspace.SubWorkspaceOptionsDescriptionForSub') : t('AddWorkspace.SubWorkspaceOptionsDescriptionForMain')}
            </Typography>
            <Autocomplete
              multiple
              freeSolo
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
            <List>
              <ListItem
                disableGutters
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
                disableGutters
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
                disableGutters
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
            </List>
            {fileSystemPathFilterEnable && (
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
                sx={{ mb: 2 }}
              />
            )}
          </>
        )}
      </AccordionDetails>
    </OptionsAccordion>
  );
}
