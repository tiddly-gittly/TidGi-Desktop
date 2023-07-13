/* eslint-disable unicorn/no-null */
import { Accordion, AccordionDetails, AccordionSummary, Button, Typography } from '@mui/material';
import { useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import styled from 'styled-components';

import { usePromiseValue } from '@/helpers/useServiceValue';
import { IWorkspaceMetaData, IWorkspaceWithMetadata } from '@services/workspaces/interface';
import { ReportErrorButton } from '../AddWorkspace/FormComponents';

const HelperTextsList = styled.ul`
  margin-top: 0;
  margin-bottom: 1.5rem;
  max-width: 70vw;
`;

const WikiErrorMessagesContainer = styled.article`
  width: 100%;
  margin-bottom: 20px;

  & pre,
  & code {
    white-space: pre-wrap;
  }
  overflow-y: auto;
  max-height: 80%;
`;

interface IWikiErrorMessagesProps {
  activeWorkspace: IWorkspaceWithMetadata;
}

export function WikiErrorMessages(props: IWikiErrorMessagesProps): JSX.Element {
  const { t } = useTranslation();
  const wikiLogs = usePromiseValue(async () => await window.service.wiki.getWikiErrorLogs(props.activeWorkspace.id, props.activeWorkspace.name));
  if (wikiLogs !== undefined) {
    return (
      <WikiErrorMessagesContainer>
        <Accordion>
          <AccordionSummary>
            <Typography align='left' variant='h5'>
              {t('Error.WikiRuntimeError')} {t('ClickForDetails')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography align='left' variant='body2'>
              {t('Error.WikiRuntimeErrorDescription')}
            </Typography>
            <Button
              variant='outlined'
              onClick={async () => {
                await window.service.native.open(wikiLogs.filePath, true);
              }}
            >
              {t('Preference.OpenLogFolder')}
            </Button>

            <div>
              <pre>
                <code>{wikiLogs.content}</code>
              </pre>
            </div>
          </AccordionDetails>
        </Accordion>
      </WikiErrorMessagesContainer>
    );
  }
  return <div />;
}

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  & > button {
    margin-right: 10px;
  }
`;

interface IViewLoadErrorMessagesProps {
  activeWorkspace: IWorkspaceWithMetadata;
  activeWorkspaceMetadata: IWorkspaceMetaData;
}

export function ViewLoadErrorMessages(props: IViewLoadErrorMessagesProps): JSX.Element {
  const { t } = useTranslation();
  const requestReload = useCallback(async (): Promise<void> => {
    await window.service.workspace.updateMetaData(props.activeWorkspace.id, { didFailLoadErrorMessage: null, isLoading: false });
    await window.service.window.reload(window.meta.windowName);
    await window.service.view.removeAllViewOfWorkspace(props.activeWorkspace.id);
    await window.service.wiki.stopWiki(props.activeWorkspace.id);
    await window.service.workspaceView.initializeWorkspaceView(props.activeWorkspace);
  }, [props.activeWorkspace]);

  return (
    <WikiErrorMessagesContainer>
      <Typography align='left' variant='h5'>
        {t('AddWorkspace.WikiNotStarted')}
      </Typography>
      <Typography align='left' variant='body2'>
        {props.activeWorkspaceMetadata.didFailLoadErrorMessage}
      </Typography>

      <br />
      <Trans t={t} i18nKey='AddWorkspace.MainPageReloadTip'>
        <Typography align='left' variant='body2' component='div'>
          <>
            Try:
            <HelperTextsList>
              <li>
                Click{' '}
                <b onClick={requestReload} onKeyPress={requestReload} role='button' tabIndex={0} style={{ cursor: 'pointer' }}>
                  Reload
                </b>{' '}
                button below or press <b>CMD_or_Ctrl + R</b> to reload the page.
              </li>
              <li>
                Check the{' '}
                <b
                  onClick={async () => {
                    await window.service.native.open(await window.service.context.get('LOG_FOLDER'), true);
                  }}
                  onKeyPress={async () => {
                    await window.service.native.open(await window.service.context.get('LOG_FOLDER'), true);
                  }}
                  role='button'
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                >
                  Log Folder
                </b>{' '}
                to see what happened.
              </li>
              <li>Backup your file, remove workspace and recreate one.</li>
            </HelperTextsList>
          </>
        </Typography>
      </Trans>

      <ButtonGroup>
        <Button variant='outlined' onClick={requestReload}>
          {t('AddWorkspace.Reload')}
        </Button>
        {typeof props.activeWorkspaceMetadata.didFailLoadErrorMessage === 'string' && <ReportErrorButton message={props.activeWorkspaceMetadata.didFailLoadErrorMessage} />}
      </ButtonGroup>
    </WikiErrorMessagesContainer>
  );
}
