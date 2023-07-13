/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { CheckBox as CheckBoxIcon, CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Autocomplete } from '@mui/lab';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  AutocompleteRenderInputParams,
  Button,
  Checkbox,
  createFilterOptions,
  Divider,
  Link,
  List,
  ListItemSecondaryAction,
  Switch,
  TextField,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { ListItem, ListItemText } from '@/components/ListItem';
import { DEFAULT_USER_NAME, getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { WikiChannel } from '@/constants/channels';
import { rootTiddlers } from '@/constants/defaultTiddlerNames';
import { tlsCertExtensions, tlsKeyExtensions } from '@/constants/fileNames';
import { getDefaultHTTPServerIP } from '@/constants/urls';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { useActualIp } from '@services/native/hooks';
import { IWorkspace } from '@services/workspaces/interface';

const AServerOptionsAccordion = styled(Accordion)`
  box-shadow: unset;
  background-color: unset;
`;
const AServerOptionsAccordionSummary = styled(AccordionSummary)`
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
const AuthTokenTextAndButtonContainer = styled.div`
  display: flex;
  flex-direction: row;
`;

export interface IServerOptionsProps {
  workspace: IWorkspace;
  workspaceSetter: (newValue: IWorkspace, requestSaveAndRestart?: boolean | undefined) => void;
}
export function ServerOptions(props: IServerOptionsProps) {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = props;
  const {
    https = { enabled: false },
    port,
    rootTiddler,
    lastNodeJSArgv,
    enableHTTPAPI,
    readOnlyMode = false,
    tokenAuth,
    authToken,
    userName,
    id,
  } = (workspace ?? {}) as unknown as IWorkspace;
  const actualIP = useActualIp(getDefaultHTTPServerIP(port), id);
  // some feature need a username to work, so if userName is empty, assign a fallbackUserName DEFAULT_USER_NAME
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const fallbackUserName = usePromiseValue<string>(async () => (await window.service.auth.get('userName')) as string, '');
  const userNameIsEmpty = !(userName || fallbackUserName);
  const alreadyEnableSomeServerOptions = readOnlyMode;
  return (
    <AServerOptionsAccordion defaultExpanded={alreadyEnableSomeServerOptions}>
      <AServerOptionsAccordionSummary expandIcon={<ExpandMoreIcon />}>{t('EditWorkspace.ServerOptions')}</AServerOptionsAccordionSummary>
      <AccordionDetails>
        <List>
          <ListItem disableGutters>
            <ListItemText primary={t('EditWorkspace.EnableHTTPAPI')} secondary={t('EditWorkspace.EnableHTTPAPIDescription')} />
            <ListItemSecondaryAction>
              <Switch
                edge='end'
                color='primary'
                checked={enableHTTPAPI}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, enableHTTPAPI: event.target.checked }, true);
                }}
              />
            </ListItemSecondaryAction>
          </ListItem>

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
                    homeUrl: await window.service.native.getLocalHostUrlWithActualInfo(getDefaultHTTPServerIP(Number(event.target.value)), id),
                  }, true);
                }
              }}
            />
          </ListItem>

          <Divider />
          <ListItem disableGutters>
            <ListItemText
              primary={t('EditWorkspace.TokenAuth')}
              secondary={
                <>
                  <div>{t('EditWorkspace.TokenAuthDescription')}</div>
                  {(userNameIsEmpty || !fallbackUserName) && <div>{t('EditWorkspace.TokenAuthAutoFillUserNameDescription')}</div>}
                </>
              }
            />
            <ListItemSecondaryAction>
              <Switch
                edge='end'
                color='primary'
                checked={tokenAuth}
                onChange={async () => {
                  const nextTokenAuth = !tokenAuth;
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  const newAuthToken = authToken || await (window.service.auth.generateOneTimeAdminAuthTokenForWorkspace(id));
                  workspaceSetter({
                    ...workspace,
                    userName: userNameIsEmpty ? DEFAULT_USER_NAME : userName,
                    tokenAuth: nextTokenAuth,
                    readOnlyMode: nextTokenAuth ? false : readOnlyMode,
                    authToken: newAuthToken,
                  }, true);
                }}
              />
            </ListItemSecondaryAction>
          </ListItem>
          {tokenAuth && (
            <>
              <ListItem disableGutters>
                <TextField
                  id='outlined-full-width'
                  label={t('EditWorkspace.TokenAuthCurrentToken')}
                  helperText={
                    <AuthTokenTextAndButtonContainer>
                      <div>{t('EditWorkspace.TokenAuthCurrentTokenDescription')}</div>{' '}
                      <Button
                        onClick={async () => {
                          const newAuthToken = await (window.service.auth.generateOneTimeAdminAuthTokenForWorkspace(id));
                          workspaceSetter({ ...workspace, authToken: newAuthToken }, true);
                        }}
                      >
                        {t('EditWorkspace.Generate')}
                      </Button>
                    </AuthTokenTextAndButtonContainer>
                  }
                  placeholder={t('EditWorkspace.TokenAuthCurrentTokenEmptyText')}
                  fullWidth
                  value={authToken ?? ''}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    workspaceSetter({ ...workspace, authToken: event.target.value }, true);
                  }}
                />
              </ListItem>
              <ListItem disableGutters>
                <ListItemText
                  primary={t('EditWorkspace.TokenAuthCurrentHeader')}
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  secondary={`"${getTidGiAuthHeaderWithToken(authToken ?? '')}": "${userName || fallbackUserName || ''}"`}
                />
              </ListItem>
            </>
          )}
          {Array.isArray(lastNodeJSArgv) && (
            <>
              <Divider />
              <ListItem disableGutters>
                <ListItemText primary={t('EditWorkspace.LastNodeJSArgv')} secondary={`tiddlywiki ${lastNodeJSArgv.join(' ')}`} />
              </ListItem>
            </>
          )}
          <Divider />
          <ListItem disableGutters>
            <ListItemText primary={t('EditWorkspace.ReadOnlyMode')} secondary={t('EditWorkspace.ReadOnlyModeDescription')} />
            <ListItemSecondaryAction>
              <Switch
                edge='end'
                color='primary'
                checked={readOnlyMode}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, readOnlyMode: event.target.checked, tokenAuth: event.target.checked ? false : tokenAuth }, true);
                }}
              />
            </ListItemSecondaryAction>
          </ListItem>

          {workspace !== undefined && readOnlyMode && <ExcludedPluginsAutocomplete workspace={workspace} workspaceSetter={workspaceSetter} />}
          <ListItem disableGutters>
            <ListItemText primary={t('EditWorkspace.EnableHTTPS')} secondary={t('EditWorkspace.EnableHTTPSDescription')} />
            <ListItemSecondaryAction>
              <Switch
                edge='end'
                color='primary'
                checked={https.enabled}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
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
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
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
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
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
          onInputChange={(event: React.SyntheticEvent, value: string) => {
            workspaceSetter({ ...workspace, rootTiddler: value });
            // void requestSaveAndRestart();
          }}
          renderInput={(parameters: AutocompleteRenderInputParams) => (
            <TextField {...parameters} label={t('EditWorkspace.WikiRootTiddler')} helperText={t('EditWorkspace.WikiRootTiddlerDescription')} />
          )}
        />
      </AccordionDetails>
    </AServerOptionsAccordion>
  );
}

const autocompleteExcludedPluginsFilter = createFilterOptions<string>();
const uncheckedIcon = <CheckBoxOutlineBlankIcon fontSize='small' />;
const checkedIcon = <CheckBoxIcon fontSize='small' />;
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

  return (
    <>
      <ListItem disableGutters>
        <ListItemText primary={t('EditWorkspace.ExcludedPlugins')} secondary={t('EditWorkspace.ExcludedPluginsDescription')} />
      </ListItem>
      <Autocomplete
        freeSolo
        multiple
        disableCloseOnSelect
        options={pluginsInWiki}
        value={excludedPlugins}
        limitTags={2}
        renderOption={(props, option, { selected }) => (
          <li {...props}>
            <Checkbox
              icon={uncheckedIcon}
              checkedIcon={checkedIcon}
              style={{ marginRight: 8 }}
              checked={selected}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                if (event.target.checked) {
                  workspaceSetter({ ...workspace, excludedPlugins: [...excludedPlugins.filter(item => item !== option), option] }, true);
                } else {
                  workspaceSetter({ ...workspace, excludedPlugins: excludedPlugins.filter(item => item !== option) }, true);
                }
              }}
            />
            {option}
          </li>
        )}
        ChipProps={{
          onDelete: (event) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            let node = (event.target).parentNode;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (node.tagName !== 'DIV') {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              node = node.parentNode;
            }
            // eslint-disable-next-line unicorn/prefer-dom-node-text-content
            const value = (node as HTMLDivElement).innerText;
            workspaceSetter({ ...workspace, excludedPlugins: excludedPlugins.filter(item => item !== value) }, true);
          },
        }}
        filterOptions={(options, parameters) => {
          const filtered = autocompleteExcludedPluginsFilter(options, parameters);

          if (parameters.inputValue !== '') {
            filtered.push(parameters.inputValue);
          }

          return filtered;
        }}
        groupBy={(option) => option.split('/')[2]}
        renderInput={(parameters: AutocompleteRenderInputParams) => (
          <TextField {...parameters} label={t('EditWorkspace.AddExcludedPlugins')} helperText={t('EditWorkspace.AddExcludedPluginsDescription')} />
        )}
      />
    </>
  );
}
