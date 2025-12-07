import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AccordionDetails, Autocomplete, AutocompleteRenderInputParams, List, ListItem, ListItemText, Switch, Tooltip, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { IWikiWorkspace } from '@services/workspaces/interface';
import { OptionsAccordion, OptionsAccordionSummary, TextField } from './styles';

interface SubWorkspaceRoutingProps {
  workspace: IWikiWorkspace;
  workspaceSetter: (newValue: IWikiWorkspace, requestSaveAndRestart?: boolean) => void;
  availableTags: string[];
  isSubWiki: boolean;
}

export function SubWorkspaceRouting(props: SubWorkspaceRoutingProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter, availableTags, isSubWiki } = props;

  const {
    tagNames,
    includeTagTree,
    fileSystemPathFilterEnable,
    fileSystemPathFilter,
  } = workspace;

  return (
    <OptionsAccordion defaultExpanded={isSubWiki}>
      <Tooltip title={t('EditWorkspace.ClickToExpand')}>
        <OptionsAccordionSummary expandIcon={<ExpandMoreIcon />} data-testid='preference-section-subWorkspaceOptions'>
          {t('AddWorkspace.SubWorkspaceOptions')}
        </OptionsAccordionSummary>
      </Tooltip>
      <AccordionDetails>
        <Typography variant='body2' color='textSecondary' sx={{ mb: 2 }}>
          {isSubWiki ? t('AddWorkspace.SubWorkspaceOptionsDescriptionForSub') : t('AddWorkspace.SubWorkspaceOptionsDescriptionForMain')}
        </Typography>
        <Autocomplete
          multiple
          freeSolo
          options={availableTags}
          value={tagNames}
          onChange={(_event: React.SyntheticEvent, newValue: string[]) => {
            void _event;
            workspaceSetter({ ...workspace, tagNames: newValue }, true);
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
              helperText={isSubWiki ? t('AddWorkspace.TagNameHelp') : t('AddWorkspace.TagNameHelpForMain')}
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
      </AccordionDetails>
    </OptionsAccordion>
  );
}
