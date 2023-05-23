/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Chip,
  createFilterOptions,
  Divider,
  Link,
  List,
  ListItemSecondaryAction,
  Switch,
  TextField,
} from '@material-ui/core';
import { ExpandMore as ExpandMoreIcon } from '@material-ui/icons';
import { Autocomplete } from '@material-ui/lab';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ListItem, ListItemText } from '@/components/ListItem';
import { WikiChannel } from '@/constants/channels';
import { rootTiddlers } from '@/constants/defaultTiddlerNames';
import { tlsCertExtensions, tlsKeyExtensions } from '@/constants/fileNames';
import { defaultServerIP } from '@/constants/urls';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { IWorkspace } from '@services/workspaces/interface';
import { useState } from 'react';

const ABlogOptionsAccordion = styled(Accordion)`
  box-shadow: unset;
  background-color: unset;
`;
const ABlogOptionsAccordionSummary = styled(AccordionSummary)`
  padding: 0;
`;
const HttpsCertKeyListItem: typeof ListItem = styled(ListItem)`
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
`;
const AutocompleteWithMarginTop: typeof Autocomplete = styled(Autocomplete)`
  margin-top: 8px;
`;
const ChipsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;

  margin-bottom: 10px;
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
    https = { enabled: false },
    id,
    port,
    readOnlyMode,
    rootTiddler,
    tokenAuth,
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
                    homeUrl: await window.service.native.getLocalHostUrlWithActualInfo(`http://${defaultServerIP}:${event.target.value}/`, id),
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
          <ListItem disableGutters>
            <ListItemText primary={t('EditWorkspace.EnableHTTPS')} secondary={t('EditWorkspace.EnableHTTPSDescription')} />
            <ListItemSecondaryAction>
              <Switch
                edge='end'
                color='primary'
                checked={https.enabled}
                onChange={(event) => {
                  workspaceSetter({ ...workspace, https: { ...https, enabled: event.target.checked } });
                }}
              />
            </ListItemSecondaryAction>
          </ListItem>
          {https.enabled && (
            <>
              <ListItem disableGutters>
                <ListItemText secondary={t('EditWorkspace.UploadOrSelectPathDescription')} />
              </ListItem>
              <HttpsCertKeyListItem>
                <Button
                  size='small'
                  variant='contained'
                  onClick={async () => {
                    const filePaths = await window.service.native.pickFile([{ name: t('EditWorkspace.HTTPSUploadCert'), extensions: tlsCertExtensions }]);
                    if (filePaths.length > 0) {
                      const certKeyFolder = await window.service.context.get('HTTPS_CERT_KEY_FOLDER');
                      const resultPath = await window.service.native.copyPath(filePaths[0], certKeyFolder, { fileToDir: true });
                      if (resultPath) {
                        workspaceSetter({ ...workspace, https: { ...https, tlsCert: resultPath } });
                      }
                    }
                  }}
                >
                  {t('EditWorkspace.HTTPSUploadCert')}
                </Button>
                <Button
                  size='small'
                  variant='outlined'
                  onClick={async () => {
                    const filePaths = await window.service.native.pickFile([{ name: t('EditWorkspace.HTTPSPickCert'), extensions: tlsCertExtensions }]);
                    if (filePaths.length > 0) {
                      workspaceSetter({ ...workspace, https: { ...https, tlsCert: filePaths[0] } });
                    }
                  }}
                >
                  {t('EditWorkspace.HTTPSPickCert')}
                </Button>
              </HttpsCertKeyListItem>
              <HttpsCertKeyListItem disableGutters>
                <TextField
                  id='outlined-full-width'
                  label={t('EditWorkspace.HTTPSCertPath')}
                  helperText={t('EditWorkspace.HTTPSCertPathDescription')}
                  placeholder='Optional'
                  fullWidth
                  value={https.tlsCert ?? ''}
                  onChange={(event) => {
                    workspaceSetter({ ...workspace, https: { ...https, tlsCert: event.target.value } });
                  }}
                />
              </HttpsCertKeyListItem>

              <HttpsCertKeyListItem>
                <Button
                  size='small'
                  variant='contained'
                  onClick={async () => {
                    const filePaths = await window.service.native.pickFile([{ name: t('EditWorkspace.HTTPSUploadKey'), extensions: tlsKeyExtensions }]);
                    if (filePaths.length > 0) {
                      const certKeyFolder = await window.service.context.get('HTTPS_CERT_KEY_FOLDER');
                      const resultPath = await window.service.native.copyPath(filePaths[0], certKeyFolder, { fileToDir: true });
                      if (resultPath) {
                        workspaceSetter({ ...workspace, https: { ...https, tlsKey: resultPath } });
                      }
                    }
                  }}
                >
                  {t('EditWorkspace.HTTPSUploadKey')}
                </Button>
                <Button
                  size='small'
                  variant='outlined'
                  onClick={async () => {
                    const filePaths = await window.service.native.pickFile([{ name: t('EditWorkspace.HTTPSPickKey'), extensions: tlsCertExtensions }]);
                    if (filePaths.length > 0) {
                      workspaceSetter({ ...workspace, https: { ...https, tlsKey: filePaths[0] } });
                    }
                  }}
                >
                  {t('EditWorkspace.HTTPSPickKey')}
                </Button>
              </HttpsCertKeyListItem>
              <HttpsCertKeyListItem disableGutters>
                <TextField
                  id='outlined-full-width'
                  label={t('EditWorkspace.HTTPSKeyPath')}
                  helperText={t('EditWorkspace.HTTPSKeyPathDescription')}
                  placeholder='Optional'
                  fullWidth
                  value={https.tlsKey ?? ''}
                  onChange={(event) => {
                    workspaceSetter({ ...workspace, https: { ...https, tlsKey: event.target.value } });
                  }}
                />
              </HttpsCertKeyListItem>
              <Divider />
            </>
          )}
        </List>
        <AutocompleteWithMarginTop
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
        {workspace !== undefined && <ExcludedPluginsAutocomplete workspace={workspace} workspaceSetter={workspaceSetter} />}
      </AccordionDetails>
    </ABlogOptionsAccordion>
  );
}

const autocompleteExcludedPluginsFilter = createFilterOptions<string>();
function ExcludedPluginsAutocomplete(props: { workspace: IWorkspace; workspaceSetter: (newValue: IWorkspace, requestSaveAndRestart?: boolean | undefined) => void }) {
  const { t } = useTranslation();
  const { workspaceSetter, workspace } = props;
  const {
    excludedPlugins,
    id,
    active,
  } = workspace;
  const pluginsInWiki = usePromiseValue(
    async () => (await window.service.wiki.wikiOperation(WikiChannel.runFilter, id, '[!has[draft.of]plugin-type[plugin]sort[]]')),
    [],
    [id, active],
  ) ?? [];
  const [currentInput, currentInputSetter] = useState('');
  const [autoCompleteClosed, autoCompleteClosedSetter] = useState(true);

  return (
    <>
      <ListItem disableGutters>
        <ListItemText primary={t('EditWorkspace.ExcludedPlugins')} secondary={t('EditWorkspace.ExcludedPluginsDescription')} />
      </ListItem>
      <ChipsContainer>
        {excludedPlugins.map(pluginName => (
          <Chip
            key={pluginName}
            label={pluginName}
            style={{ marginRight: 1, marginBottom: 1 }}
            onClick={() => {
              currentInputSetter(pluginName);
            }}
            onDelete={() => {
              workspaceSetter({ ...workspace, excludedPlugins: excludedPlugins.filter(item => item !== pluginName) });
            }}
          />
        ))}
      </ChipsContainer>
      <Autocomplete
        freeSolo
        options={pluginsInWiki}
        value={currentInput}
        onInputChange={(_, value) => {
          currentInputSetter(value);
        }}
        filterOptions={(options, parameters) => {
          const filtered = autocompleteExcludedPluginsFilter(options, parameters);

          if (parameters.inputValue !== '') {
            filtered.push(parameters.inputValue);
          }

          return filtered;
        }}
        groupBy={(option) => option.split('/')[2]}
        autoSelect
        onKeyDown={(event) => {
          if (autoCompleteClosed && event.key === 'Enter') {
            // Prevent's default 'Enter' behavior.
            event.preventDefault();
            workspaceSetter({ ...workspace, excludedPlugins: [...excludedPlugins.filter(item => item !== currentInput), currentInput] }, true);
            currentInputSetter('');
          }
        }}
        renderInput={(parameters) => <TextField {...parameters} label={t('EditWorkspace.AddExcludedPlugins')} helperText={t('EditWorkspace.AddExcludedPluginsDescription')} />}
        onOpen={() => {
          autoCompleteClosedSetter(false);
        }}
        onClose={() => {
          autoCompleteClosedSetter(true);
        }}
      />
    </>
  );
}
