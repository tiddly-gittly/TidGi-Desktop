import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import { Autocomplete, AutocompleteRenderInputParams, Button, Checkbox, createFilterOptions, Divider, Link, Switch, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { startTransition, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { DEFAULT_USER_NAME, getTidGiAuthHeaderWithToken } from '@/constants/auth';
import { WikiChannel } from '@/constants/channels';
import { rootTiddlers } from '@/constants/defaultTiddlerNames';
import { tlsCertExtensions, tlsKeyExtensions } from '@/constants/fileNames';
import { getDefaultHTTPServerIP } from '@/constants/urls';
import { usePromiseValue } from '@/helpers/useServiceValue';
import { useActualIp, useActualIps } from '@services/native/hooks';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { isWikiWorkspace } from '@services/workspaces/interface';
import { useWorkspaceForm } from '../WorkspaceFormContext';

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

export function ServerPortItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { port, id } = workspace;
  const actualIP = useActualIp(getDefaultHTTPServerIP(port), id);
  const actualIPs = useActualIps(getDefaultHTTPServerIP(port), id) ?? [];
  const singleActualIP = actualIPs[0] ?? actualIP;
  const [portInput, setPortInput] = useState(() => String(port ?? ''));
  const portReference = useRef(port);
  if (portReference.current !== port) {
    portReference.current = port;
    setPortInput(String(port ?? ''));
  }

  return (
    <ListItem>
      <TextField
        id='outlined-full-width'
        label={t('EditWorkspace.Port')}
        helperText={
          <span>
            {t('EditWorkspace.URL')} {actualIPs.length > 1
              ? (
                <span>
                  {actualIPs.map((ip, index) => (
                    <span key={`${ip}-${index}`}>
                      {index > 0 && <br />}
                      <Link
                        onClick={async () => {
                          await window.service.native.openURI(ip);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {ip}
                      </Link>
                    </span>
                  ))}
                </span>
              )
              : (
                <Link
                  onClick={async () => {
                    if (singleActualIP) {
                      await window.service.native.openURI(singleActualIP);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {singleActualIP}
                </Link>
              )}
          </span>
        }
        placeholder='Optional'
        value={portInput}
        onChange={(event) => {
          const raw = event.target.value;
          setPortInput(raw);
          startTransition(() => {
            const parsed = raw.trim() === '' ? 0 : Number.parseInt(raw.trim(), 10);
            if (!Number.isNaN(parsed) && parsed >= 0) {
              workspaceSetter({ ...workspace, port: parsed }, true);
            }
          });
        }}
        onBlur={() => {
          const trimmed = portInput.trim();
          const number_ = trimmed === '' ? 0 : Number.parseInt(trimmed, 10);
          if (!Number.isNaN(number_) && number_ >= 0) {
            setPortInput(String(number_));
            void (async () => {
              const homeUrl = await window.service.native.getLocalHostUrlWithActualInfo(getDefaultHTTPServerIP(number_), id);
              workspaceSetter({ ...workspace, port: number_, homeUrl }, true);
            })();
          } else {
            setPortInput(String(port ?? ''));
          }
        }}
      />
    </ListItem>
  );
}

export function ServerTokenAuthItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { tokenAuth, authToken, readOnlyMode, userName, id } = workspace;
  const fallbackUserName = usePromiseValue<string>(async () => (await window.service.auth.get('userName'))!, '');
  const userNameIsEmpty = !(userName || fallbackUserName);

  return (
    <ListItem
      secondaryAction={
        <Switch
          edge='end'
          color='primary'
          checked={tokenAuth}
          onChange={async () => {
            const nextTokenAuth = !tokenAuth;
            const newAuthToken = authToken || (await window.service.auth.generateOneTimeAdminAuthTokenForWorkspace(id));
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
        slotProps={{ secondary: { component: 'div' } }}
        secondary={
          <>
            <div>{t('EditWorkspace.TokenAuthDescription')}</div>
            {(userNameIsEmpty || !fallbackUserName) && <div>{t('EditWorkspace.TokenAuthAutoFillUserNameDescription')}</div>}
          </>
        }
      />
    </ListItem>
  );
}

export function ServerAuthTokenItem(_props: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { tokenAuth, authToken, id } = workspace;
  if (!tokenAuth) return null;

  return (
    <ListItem>
      <TextField
        id='outlined-full-width'
        label={t('EditWorkspace.TokenAuthCurrentToken')}
        slotProps={{ formHelperText: { component: 'div' } }}
        helperText={
          <AuthTokenTextAndButtonContainer>
            <div>{t('EditWorkspace.TokenAuthCurrentTokenDescription')}</div>{' '}
            <Button
              onClick={async () => {
                const newAuthToken = await window.service.auth.generateOneTimeAdminAuthTokenForWorkspace(id);
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
  );
}

export function ServerAuthHeaderItem(_props: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace } = useWorkspaceForm();
  const { tokenAuth, authToken, userName } = workspace;
  const fallbackUserName = usePromiseValue<string>(async () => (await window.service.auth.get('userName'))!, '');
  if (!tokenAuth) return null;

  return (
    <ListItem>
      <ListItemText
        primary={t('EditWorkspace.TokenAuthCurrentHeader')}
        secondary={`"${getTidGiAuthHeaderWithToken(authToken ?? '')}": "${userName || fallbackUserName || ''}"`}
      />
    </ListItem>
  );
}

export function ServerLastNodeJSArgvItem(_props: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace } = useWorkspaceForm();
  const { lastNodeJSArgv } = workspace;
  if (!Array.isArray(lastNodeJSArgv)) return null;

  return (
    <>
      <Divider />
      <ListItem>
        <ListItemText primary={t('EditWorkspace.LastNodeJSArgv')} secondary={`tiddlywiki ${lastNodeJSArgv.join(' ')}`} />
      </ListItem>
    </>
  );
}

export function ServerReadOnlyModeItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { readOnlyMode, tokenAuth } = workspace;

  return (
    <ListItem
      secondaryAction={
        <Switch
          edge='end'
          color='primary'
          checked={readOnlyMode}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            workspaceSetter({
              ...workspace,
              readOnlyMode: event.target.checked,
              tokenAuth: event.target.checked ? false : tokenAuth,
            }, true);
          }}
        />
      }
    >
      <ListItemText primary={t('EditWorkspace.ReadOnlyMode')} secondary={t('EditWorkspace.ReadOnlyModeDescription')} />
    </ListItem>
  );
}

const autocompleteExcludedPluginsFilter = createFilterOptions<string>();
const uncheckedIcon = <CheckBoxOutlineBlankIcon fontSize='small' />;
const checkedIcon = <CheckBoxIcon fontSize='small' />;

export function ServerExcludedPluginsItem(_props: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  if (!isWikiWorkspace(workspace) || !workspace.readOnlyMode) return null;

  const { excludedPlugins, id, active } = workspace;
  const pluginsInWiki = usePromiseValue(
    async () => (await window.service.wiki.wikiOperationInBrowser(WikiChannel.runFilter, id, ['[!has[draft.of]plugin-type[plugin]sort[]]'])),
    [],
    [id, active],
  ) ?? [];

  return (
    <>
      <ListItem>
        <ListItemText primary={t('EditWorkspace.ExcludedPlugins')} secondary={t('EditWorkspace.ExcludedPluginsDescription')} />
      </ListItem>
      <ListItem>
        <Autocomplete
          fullWidth
          freeSolo
          multiple
          disableCloseOnSelect
          options={pluginsInWiki}
          value={excludedPlugins}
          limitTags={2}
          renderOption={({ key: _key, ...props }, option, { selected }) => (
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
      </ListItem>
    </>
  );
}

export function ServerHttpsToggleItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const https = workspace.https ?? { enabled: false };

  return (
    <ListItem
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
  );
}

export function ServerHttpsCertItems(_props: ICustomItemProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const https = workspace.https ?? { enabled: false };
  if (!https.enabled) return null;

  return (
    <>
      <ListItem>
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
      <HttpsCertKeyListItem>
        <TextField
          id='outlined-full-width'
          label={t('EditWorkspace.HTTPSCertPath')}
          helperText={t('EditWorkspace.HTTPSCertPathDescription')}
          placeholder='Optional'
          fullWidth
          value={https.tlsCert ?? ''}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            workspaceSetter({ ...workspace, https: { ...https, tlsCert: event.target.value || undefined } });
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
      <HttpsCertKeyListItem>
        <TextField
          id='outlined-full-width'
          label={t('EditWorkspace.HTTPSKeyPath')}
          helperText={t('EditWorkspace.HTTPSKeyPathDescription')}
          placeholder='Optional'
          fullWidth
          value={https.tlsKey ?? ''}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            workspaceSetter({ ...workspace, https: { ...https, tlsKey: event.target.value || undefined } });
          }}
        />
      </HttpsCertKeyListItem>
      <Divider />
    </>
  );
}

export function ServerRootTiddlerItem(_props: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const { workspace, workspaceSetter } = useWorkspaceForm();
  const { rootTiddler } = workspace;

  return (
    <ListItem>
      <AutocompleteWithMarginTop
        fullWidth
        freeSolo
        options={rootTiddlers}
        value={rootTiddler}
        defaultValue={rootTiddlers[0]}
        onInputChange={(event: React.SyntheticEvent, value: string) => {
          void event;
          workspaceSetter({ ...workspace, rootTiddler: value }, true);
        }}
        renderInput={(parameters: AutocompleteRenderInputParams) => (
          <TextField {...parameters} label={t('EditWorkspace.WikiRootTiddler')} helperText={t('EditWorkspace.WikiRootTiddlerDescription')} />
        )}
        renderOption={({ key: _key, ...props }, option) => (
          <li {...props}>{t(`EditWorkspace.WikiRootTiddlerItems.${String(option).replace('$:/core/save/', '')}`)} ({String(option)})</li>
        )}
      />
    </ListItem>
  );
}
