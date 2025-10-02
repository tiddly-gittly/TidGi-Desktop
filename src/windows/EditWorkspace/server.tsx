import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  AutocompleteRenderInputParams,
  Button,
  Checkbox,
  createFilterOptions,
  Divider,
  Link,
  List,
  Switch,
  TextField,
  Tooltip,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { DEFAULT_USER_NAME, getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { WikiChannel } from '@/constants/channels';
import { rootTiddlers } from '@/constants/defaultTiddlerNames';
import { tlsCertExtensions, tlsKeyExtensions } from '@/constants/fileNames';
import { getDefaultHTTPServerIP } from '@/constants/urls';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { useActualIp } from '@services/native/hooks';
import { isWikiWorkspace, IWorkspace } from '@services/workspaces/interface';

const AServerOptionsAccordion = styled(Accordion)`
  box-shadow: unset;
  background-color: unset;
`;
const AServerOptionsAccordionSummary = styled(AccordionSummary)`
  padding: 0;
  flex-direction: row-reverse;
`;
const HttpsCertKeyListItem = styled(ListItem)`
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
`;
const AutocompleteWithMarginTop = styled(Autocomplete)`
  margin-top: 8px;
`;
const AuthTokenTextAndButtonContainer = styled('div')`
  display: flex;
  flex-direction: row;
`;

export interface IServerOptionsProps {
  workspace: IWorkspace;
  workspaceSetter: (newValue: IWorkspace, requestSaveAndRestart?: boolean) => void;
}
export function ServerOptions(props: IServerOptionsProps) {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = props;

  const isWiki = isWikiWorkspace(workspace);
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
  } = isWiki ? workspace : {
    https: { enabled: false },
    port: 0,
    rootTiddler: '',
    lastNodeJSArgv: [],
    enableHTTPAPI: false,
    readOnlyMode: false,
    tokenAuth: false,
    authToken: '',
    userName: '',
    id: workspace.id,
  };
  const actualIP = useActualIp(getDefaultHTTPServerIP(port), id);
  // some feature need a username to work, so if userName is empty, assign a fallbackUserName DEFAULT_USER_NAME

  const fallbackUserName = usePromiseValue<string>(async () => (await window.service.auth.get('userName'))!, '');
  const userNameIsEmpty = !(userName || fallbackUserName);
  const alreadyEnableSomeServerOptions = readOnlyMode;
  return (
    <AServerOptionsAccordion defaultExpanded={alreadyEnableSomeServerOptions}>
      <Tooltip title={t('EditWorkspace.ClickToExpand')}>
        <AServerOptionsAccordionSummary expandIcon={<ExpandMoreIcon />}>
          {t('EditWorkspace.ServerOptions')} ({t('EditWorkspace.EnableHTTPAPI')})
        </AServerOptionsAccordionSummary>
      </Tooltip>
      <AccordionDetails>
        <List>
          <ListItem
            disableGutters
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={enableHTTPAPI}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, enableHTTPAPI: event.target.checked }, true);
                }}
              />
            }
          >
            <ListItemText primary={t('EditWorkspace.EnableHTTPAPI')} secondary={t('EditWorkspace.EnableHTTPAPIDescription')} />
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
                      if (actualIP) {
                        await window.service.native.openURI(actualIP);
                      }
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
          <ListItem
            disableGutters
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={tokenAuth}
                onChange={async () => {
                  const nextTokenAuth = !tokenAuth;

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
            }
          >
            <ListItemText
              primary={t('EditWorkspace.TokenAuth')}
              secondary={
                <>
                  <div>{t('EditWorkspace.TokenAuthDescription')}</div>
                  {(userNameIsEmpty || !fallbackUserName) && <div>{t('EditWorkspace.TokenAuthAutoFillUserNameDescription')}</div>}
                </>
              }
            />
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
          <ListItem
            disableGutters
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={readOnlyMode}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, readOnlyMode: event.target.checked, tokenAuth: event.target.checked ? false : tokenAuth }, true);
                }}
              />
            }
          >
            <ListItemText primary={t('EditWorkspace.ReadOnlyMode')} secondary={t('EditWorkspace.ReadOnlyModeDescription')} />
          </ListItem>

          {workspace !== undefined && readOnlyMode && <ExcludedPluginsAutocomplete workspace={workspace} workspaceSetter={workspaceSetter} />}
          <ListItem
            disableGutters
            secondaryAction={
              <Switch
                edge='end'
                color='primary'
                checked={https.enabled}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  workspaceSetter({ ...workspace, https: { ...https, enabled: event.target.checked } });
                }}
              />
            }
          >
            <ListItemText primary={t('EditWorkspace.EnableHTTPS')} secondary={t('EditWorkspace.EnableHTTPSDescription')} />
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
            void event;
            workspaceSetter({ ...workspace, rootTiddler: value });
            // void requestSaveAndRestart();
          }}
          renderInput={(parameters: AutocompleteRenderInputParams) => (
            <TextField {...parameters} label={t('EditWorkspace.WikiRootTiddler')} helperText={t('EditWorkspace.WikiRootTiddlerDescription')} />
          )}
          renderOption={(props, option) => <li {...props}>{t(`EditWorkspace.WikiRootTiddlerItems.${String(option).replace('$:/core/save/', '')}`)} ({String(option)})</li>}
        />
      </AccordionDetails>
    </AServerOptionsAccordion>
  );
}

const autocompleteExcludedPluginsFilter = createFilterOptions<string>();
const uncheckedIcon = <CheckBoxOutlineBlankIcon fontSize='small' />;
const checkedIcon = <CheckBoxIcon fontSize='small' />;
function ExcludedPluginsAutocomplete(props: { workspace: IWorkspace; workspaceSetter: (newValue: IWorkspace, requestSaveAndRestart?: boolean) => void }) {
  const { t } = useTranslation();
  const { workspaceSetter, workspace } = props;

  if (!isWikiWorkspace(workspace)) {
    return null;
  }

  const {
    excludedPlugins,
    id,
    active,
  } = workspace;
  const pluginsInWiki = usePromiseValue(
    async () => (await window.service.wiki.wikiOperationInBrowser(WikiChannel.runFilter, id, ['[!has[draft.of]plugin-type[plugin]sort[]]'])),
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
        slotProps={{
          chip: {
            onDelete: (event: Event) => {
              // Be defensive: event.target can be null and EventTarget doesn't have DOM properties in TS.
              const target = event.target as HTMLElement | null;
              if (!target) return;
              let node = target.parentNode as HTMLElement | null;
              if (!node) return;
              if (node.tagName !== 'DIV') {
                node = node.parentNode as HTMLElement | null;
                if (!node) return;
              }

              const value = node.innerText;
              workspaceSetter({ ...workspace, excludedPlugins: excludedPlugins.filter(item => item !== value) }, true);
            },
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
