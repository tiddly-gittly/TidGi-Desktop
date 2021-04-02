/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { Typography, Button, LinearProgress, Snackbar } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';

import type { IWikiWorkspaceFormProps } from './useForm';
import { useNewWiki } from './useNewWiki';
import { useWikiCreationProgress } from './useIndicator';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

export function NewWikiDoneButton({ form, isCreateMainWorkspace }: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [onSubmit, wikiCreationMessage, hasError] = useNewWiki(isCreateMainWorkspace, form);
  const [logPanelOpened, logPanelSetter, progressBarOpen] = useWikiCreationProgress(wikiCreationMessage, hasError);
  return (
    <>
      {progressBarOpen && <LinearProgress color="secondary" />}
      <Snackbar open={logPanelOpened} autoHideDuration={5000} onClose={() => logPanelSetter(false)}>
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      {(!form.gitRepoUrl || !form.gitUserInfo?.accessToken) && (
        <Typography variant="body1" display="inline">
          {t('AddWorkspace.NoGitInfoAlert')}
        </Typography>
      )}
      {isCreateMainWorkspace ? (
        <CloseButton variant="contained" color="secondary" disabled={!hasError} onClick={onSubmit}>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.CreateWiki')}
          </Typography>
          <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none' }}>
            {form.wikiFolderLocation}
          </Typography>
        </CloseButton>
      ) : (
        <CloseButton variant="contained" color="secondary" disabled={!hasError} onClick={onSubmit}>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.CreateWiki')}
          </Typography>
          <Typography variant="body2" noWrap display="inline" align="center" style={{ direction: 'rtl', textTransform: 'none', marginLeft: 5, marginRight: 5 }}>
            {form.wikiFolderLocation}
          </Typography>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.AndLinkToMainWorkspace')}
          </Typography>
        </CloseButton>
      )}
    </>
  );
}
