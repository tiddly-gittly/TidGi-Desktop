import React from 'react';
import styled from 'styled-components';
import { Trans, useTranslation } from 'react-i18next';

import { Typography, Button, LinearProgress, Snackbar } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';

import useWikiCreationMessage from './use-wiki-creation-message';
import type { IWikiWorkspaceFormProps } from './useForm';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

export function NewWikiDoneButton({ form }: IWikiWorkspaceFormProps): JSX.Element {
  const wikiFolderLocation = `${parentFolderLocation}/${wikiFolderName}`;

  const workspaceFormData = {
    name: wikiFolderLocation,
    isSubWiki: !isCreateMainWorkspace,
    mainWikiToLink: mainWikiToLink.name,
    port,
    homeUrl: `http://localhost:${port}/`,
    gitUrl: githubWikiUrl, // don't need .git suffix
    userInfo,
    tagName: isCreateMainWorkspace ? undefined : tagName,
  };

  const [snackBarOpen, progressBarOpen, snackBarOpenSetter] = useWikiCreationMessage(wikiCreationMessage);
  const { t } = useTranslation();
  return (
    <>
      {progressBarOpen && <LinearProgress color="secondary" />}
      <Snackbar open={snackBarOpen} autoHideDuration={5000} onClose={() => snackBarOpenSetter(false)}>
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      {isCreateMainWorkspace && (!githubWikiUrl || !userInfo) && (
        <Typography variant="body1" display="inline">
          {t('AddWorkspace.NoGitInfoAlert')}
        </Typography>
      )}
      {isCreateMainWorkspace ? (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!parentFolderLocation || progressBarOpen}
          onClick={async () => {
            updateForm(workspaceFormData);
            setWikiCreationMessage(t('AddWorkspace.Processing'));
            let creationError: string | undefined;
            try {
              await window.service.wiki.copyWikiTemplate(parentFolderLocation, wikiFolderName);
            } catch (error) {
              console.info(error);
              creationError = String(error);
            }
            if (creationError === undefined) {
              try {
                await window.service.wikiGitWorkspace.initWikiGitTransaction(wikiFolderLocation, githubWikiUrl, userInfo, true);
              } catch (error) {
                console.info(error);
                creationError = String(error);
              }
            }
            if (creationError !== undefined) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}>
          <Trans t={t} i18nKey="AddWorkspace.NewWikiDoneButton" wikiFolderLocation={wikiFolderLocation}>
            {parentFolderLocation && (
              <>
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
                  {{ wikiFolderLocation }}
                </Typography>
              </>
            )}
            <Typography variant="body1" display="inline">
              as Wiki folder
            </Typography>
          </Trans>
        </CloseButton>
      ) : (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!parentFolderLocation || !mainWikiToLink.name || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            if (!userInfo) return;
            setWikiCreationMessage(t('AddWorkspace.Processing'));
            updateForm(workspaceFormData);
            let creationError: string | undefined;
            try {
              await window.service.wiki.createSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink.name, tagName);
            } catch (error) {
              console.info(error);
              creationError = String(error);
            }
            if (creationError === undefined) {
              try {
                await window.service.wikiGitWorkspace.initWikiGitTransaction(wikiFolderLocation, githubWikiUrl, userInfo, false);
              } catch (error) {
                console.info(error);
                creationError = String(error);
              }
            }
            if (creationError !== undefined) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}>
          <Trans t={t} i18nKey="AddWorkspace.NewSubWikiDoneButton" wikiFolderLocation={wikiFolderLocation}>
            {parentFolderLocation && (
              <>
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                <Typography
                  variant="body2"
                  noWrap
                  display="inline"
                  align="center"
                  style={{ direction: 'rtl', textTransform: 'none', marginLeft: 5, marginRight: 5 }}>
                  {{ wikiFolderLocation }}
                </Typography>
              </>
            )}
            <Typography variant="body1" display="inline">
              as Wiki folder
            </Typography>
            <Typography variant="body1" display="inline">
              and link to main Workspace
            </Typography>
          </Trans>
        </CloseButton>
      )}
    </>
  );
}
