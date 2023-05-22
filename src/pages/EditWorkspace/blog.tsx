/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { Accordion, AccordionDetails, AccordionSummary, Divider, Link, List, ListItemSecondaryAction, Switch, TextField } from '@material-ui/core';
import { ExpandMore as ExpandMoreIcon } from '@material-ui/icons';
import { Autocomplete } from '@material-ui/lab';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ListItem, ListItemText } from '@/components/ListItem';
import { rootTiddlers } from '@/constants/defaultTiddlerNames';
import { defaultServerIP } from '@/constants/urls';
import { IWorkspace } from '@services/workspaces/interface';

const ABlogOptionsAccordion = styled(Accordion)`
  box-shadow: unset;
  background-color: unset;
`;
const ABlogOptionsAccordionSummary = styled(AccordionSummary)`
  padding: 0;
`;

export interface IBlogOptionsProps {
  actualIP: string | undefined;
  workspace: IWorkspace;
  workspaceSetter: (newValue: IWorkspace, requestSaveAndRestart?: boolean | undefined) => void;
}
export function BlogOptions(props: IBlogOptionsProps) {
  const { t } = useTranslation();
  const { workspace, actualIP, workspaceSetter } = props;
  const {
    port,
    tokenAuth,
    readOnlyMode,
    rootTiddler,
  } = (workspace ?? {}) as unknown as IWorkspace;

  const alreadyEnableSomeBlogOptions = readOnlyMode;
  return (
    <ABlogOptionsAccordion defaultExpanded={alreadyEnableSomeBlogOptions}>
      <ABlogOptionsAccordionSummary expandIcon={<ExpandMoreIcon />}>{t('EditWorkspace.BlogOptions')}</ABlogOptionsAccordionSummary>
      <AccordionDetails>
        <List>
          <ListItem disableGutters>
            <TextField
              id='outlined-full-width'
              label={t('EditWorkspace.Port')}
              helperText={
                <span>
                  {t('EditWorkspace.URL')}{' '}
                  <Link
                    onClick={async () => {
                      actualIP && (await window.service.native.open(actualIP));
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {actualIP}
                  </Link>
                </span>
              }
              placeholder='Optional'
              value={port}
              onChange={async (event) => {
                if (!Number.isNaN(Number.parseInt(event.target.value))) {
                  workspaceSetter({
                    ...workspace,
                    port: Number(event.target.value),
                    homeUrl: await window.service.native.getLocalHostUrlWithActualIP(`http://${defaultServerIP}:${event.target.value}/`),
                  }, true);
                }
              }}
            />
          </ListItem>
          <Divider />
          <ListItem disableGutters>
            <ListItemText primary={t('EditWorkspace.ReadOnlyMode')} secondary={t('EditWorkspace.ReadOnlyModeDescription')} />
            <ListItemSecondaryAction>
              <Switch
                edge='end'
                color='primary'
                checked={readOnlyMode}
                onChange={(event) => {
                  workspaceSetter({ ...workspace, readOnlyMode: event.target.checked, tokenAuth: event.target.checked ? false : tokenAuth }, true);
                }}
              />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
        <Autocomplete
          freeSolo
          options={rootTiddlers}
          value={rootTiddler}
          defaultValue={rootTiddlers[0]}
          onInputChange={(_, value) => {
            workspaceSetter({ ...workspace, rootTiddler: value });
            // void requestSaveAndRestart();
          }}
          renderInput={(parameters) => <TextField {...parameters} label={t('EditWorkspace.WikiRootTiddler')} helperText={t('EditWorkspace.WikiRootTiddlerDescription')} />}
        />
      </AccordionDetails>
    </ABlogOptionsAccordion>
  );
}
