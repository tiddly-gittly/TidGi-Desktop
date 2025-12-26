import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AccordionDetails, Divider, List, ListItem, ListItemText, Switch, Tooltip } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { isWikiWorkspace, IWorkspace, wikiWorkspaceDefaultValues } from '@services/workspaces/interface';
import { OptionsAccordion, OptionsAccordionSummary, TextField } from './styles';

interface MiscOptionsProps {
  workspace: IWorkspace;
  workspaceSetter: (newValue: IWorkspace, requestSaveAndRestart?: boolean) => void;
  rememberLastPageVisited: boolean | undefined;
}

export function MiscOptions(props: MiscOptionsProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter, rememberLastPageVisited } = props;

  const isWiki = isWikiWorkspace(workspace);
  const {
    disableAudio = wikiWorkspaceDefaultValues.disableAudio,
    disableNotifications = wikiWorkspaceDefaultValues.disableNotifications,
    enableFileSystemWatch = wikiWorkspaceDefaultValues.enableFileSystemWatch,
    hibernateWhenUnused = wikiWorkspaceDefaultValues.hibernateWhenUnused,
    homeUrl = '',
    isSubWiki = false,
    lastUrl = null,
  } = isWiki ? workspace : {
    disableAudio: wikiWorkspaceDefaultValues.disableAudio,
    disableNotifications: wikiWorkspaceDefaultValues.disableNotifications,
    enableFileSystemWatch: wikiWorkspaceDefaultValues.enableFileSystemWatch,
    hibernateWhenUnused: wikiWorkspaceDefaultValues.hibernateWhenUnused,
    homeUrl: '',
    isSubWiki: false,
    lastUrl: null,
  };

  return (
    <OptionsAccordion>
      <Tooltip title={t('EditWorkspace.ClickToExpand')}>
        <OptionsAccordionSummary expandIcon={<ExpandMoreIcon />} data-testid='preference-section-miscOptions'>
          {t('EditWorkspace.MiscOptions')}
        </OptionsAccordionSummary>
      </Tooltip>
      <AccordionDetails>
        {!isSubWiki && (
          <List>
            <Divider />
            <ListItem
              disableGutters
              secondaryAction={
                <Switch
                  edge='end'
                  color='primary'
                  checked={hibernateWhenUnused}
                  data-testid='hibernate-when-unused-switch'
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    workspaceSetter({ ...workspace, hibernateWhenUnused: event.target.checked });
                  }}
                />
              }
            >
              <ListItemText primary={t('EditWorkspace.HibernateTitle')} secondary={t('EditWorkspace.HibernateDescription')} />
            </ListItem>
            <ListItem
              disableGutters
              secondaryAction={
                <Switch
                  edge='end'
                  color='primary'
                  checked={disableNotifications}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    workspaceSetter({ ...workspace, disableNotifications: event.target.checked });
                  }}
                />
              }
            >
              <ListItemText primary={t('EditWorkspace.DisableNotificationTitle')} secondary={t('EditWorkspace.DisableNotification')} />
            </ListItem>
            <ListItem
              disableGutters
              secondaryAction={
                <Switch
                  edge='end'
                  color='primary'
                  checked={disableAudio}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    workspaceSetter({ ...workspace, disableAudio: event.target.checked });
                  }}
                />
              }
            >
              <ListItemText primary={t('EditWorkspace.DisableAudioTitle')} secondary={t('EditWorkspace.DisableAudio')} />
            </ListItem>
            <Divider />
            <ListItem
              disableGutters
              secondaryAction={
                <Switch
                  edge='end'
                  color='primary'
                  checked={enableFileSystemWatch}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    workspaceSetter({ ...workspace, enableFileSystemWatch: event.target.checked }, true);
                  }}
                />
              }
            >
              <ListItemText
                primary={t('EditWorkspace.EnableFileSystemWatchTitle')}
                secondary={t('EditWorkspace.EnableFileSystemWatchDescription')}
              />
            </ListItem>
          </List>
        )}
        {!isSubWiki && rememberLastPageVisited && (
          <TextField
            id='outlined-full-width'
            label={t('EditWorkspace.LastVisitState')}
            helperText={t('Preference.RememberLastVisitState')}
            placeholder={homeUrl}
            value={lastUrl}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              workspaceSetter({
                ...workspace,
                lastUrl: (event.target.value || homeUrl) ?? '',
              });
            }}
          />
        )}
      </AccordionDetails>
    </OptionsAccordion>
  );
}
