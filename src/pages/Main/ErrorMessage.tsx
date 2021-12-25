import { useCallback } from 'react';
import Button from '@material-ui/core/Button';
import { Trans, useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { IWorkspaceWithMetadata, IWorkspaceMetaData } from '@services/workspaces/interface';
import { Typography } from '@material-ui/core';

const HelperTextsList = styled.ul`
  margin-top: 0;
  margin-bottom: 1.5rem;
  max-width: 70vw;
`;

interface IWikiErrorMessagesProps {
  activeWorkspace: IWorkspaceWithMetadata;
}

export function WikiErrorMessages(props: IWikiErrorMessagesProps): JSX.Element {
  const { t } = useTranslation();
  const wikiLogs = usePromiseValue(async () => await window.service.wiki.getWikiLogs(props.activeWorkspace.wikiFolderLocation));
  if (wikiLogs !== undefined) {
    return (
      <div>
        <Button onClick={async () => await window.service.native.open(wikiLogs.filePath)}>{t('Preference.OpenLogFolder')}</Button>
        <div>
          <pre>
            <code>{wikiLogs.content}</code>
          </pre>
        </div>
      </div>
    );
  }
  return <div />;
}

interface IViewLoadErrorMessagesProps {
  activeWorkspaceMetadata: IWorkspaceMetaData;
}

export function ViewLoadErrorMessages(props: IViewLoadErrorMessagesProps): JSX.Element {
  const { t } = useTranslation();
  const requestReload = useCallback(async (): Promise<void> => {
    await window.service.window.reload(window.meta.windowName);
  }, []);

  return (
    <div>
      <Typography align="left" variant="h5">
        {t('AddWorkspace.WikiNotStarted')}
      </Typography>
      <Typography align="left" variant="body2">
        {props.activeWorkspaceMetadata.didFailLoadErrorMessage}
      </Typography>

      <br />
      <Trans t={t} i18nKey="AddWorkspace.MainPageReloadTip">
        <Typography align="left" variant="body2">
          <>
            Try:
            <HelperTextsList>
              <li>
                Click{' '}
                <b onClick={requestReload} onKeyPress={requestReload} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
                  Reload
                </b>{' '}
                button below or press <b>CMD_or_Ctrl + R</b> to reload the page.
              </li>
              <li>
                Check the{' '}
                <b
                  onClick={async () => await window.service.native.open(await window.service.context.get('LOG_FOLDER'), true)}
                  onKeyPress={async () => await window.service.native.open(await window.service.context.get('LOG_FOLDER'), true)}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}>
                  Log Folder
                </b>{' '}
                to see what happened.
              </li>
              <li>Backup your file, remove workspace and recreate one.</li>
            </HelperTextsList>
          </>
        </Typography>
      </Trans>

      <Button variant="outlined" onClick={requestReload}>
        {t('AddWorkspace.Reload')}
      </Button>
    </div>
  );
}
