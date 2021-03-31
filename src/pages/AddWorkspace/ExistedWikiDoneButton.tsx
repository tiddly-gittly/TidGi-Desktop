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

export function ExistedWikiDoneButton({ form }: IWikiWorkspaceFormProps): JSX.Element{
  const port = isCreateMainWorkspace ? wikiPort : mainWikiToLink.port;
  const workspaceFormData = {
    name: existedFolderLocation,
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

      {isCreateMainWorkspace ? (
        <CloseButton
          variant="contained"
          color="secondary"
          disabled={!existedFolderLocation || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            updateForm(workspaceFormData);
            let creationError: string | undefined;
            try {
              await window.service.wiki.ensureWikiExist(existedFolderLocation, true);
            } catch (error) {
              creationError = String(error);
            }
            if (creationError !== undefined) {
              setWikiCreationMessage(creationError);
            } else {
              save();
            }
          }}>
          <Trans t={t} i18nKey="AddWorkspace.NewWikiDoneButton" wikiFolderLocation={existedFolderLocation}>
            {existedFolderLocation && (
              <>
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
                  {{ wikiFolderLocation: existedFolderLocation }}
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
          disabled={!existedFolderLocation || !mainWikiToLink.name || !githubWikiUrl || progressBarOpen || !userInfo}
          onClick={async () => {
            if (!userInfo) return;
            const wikiFolderName = window.remote.getBaseName(existedFolderLocation);
            const parentFolderLocation = window.remote.getDirectoryName(existedFolderLocation);
            updateForm(workspaceFormData);
            let creationError: string | undefined;
            try {
              await window.service.wiki.ensureWikiExist(existedFolderLocation, false);
            } catch (error) {
              creationError = String(error);
            }
            if (creationError !== undefined) {
              try {
                await window.service.wiki.createSubWiki(parentFolderLocation, wikiFolderName, mainWikiToLink.name, tagName, true);
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
          <Trans t={t} i18nKey="AddWorkspace.NewSubWikiDoneButton" wikiFolderLocation={existedFolderLocation}>
            {existedFolderLocation && (
              <>
                <Typography variant="body1" display="inline">
                  Use
                </Typography>
                <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
                  {{ wikiFolderLocation: existedFolderLocation }}
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
