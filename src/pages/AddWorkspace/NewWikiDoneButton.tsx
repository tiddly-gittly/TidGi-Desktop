/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';

import { Typography, Button, LinearProgress, Snackbar } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';

import type { IWikiWorkspaceFormProps } from './useForm';
import { useValidateNewWiki, useNewWiki } from './useNewWiki';
import { useWikiCreationProgress } from './useIndicator';
import { WikiLocation } from './FormComponents';

const CloseButton = styled(Button)`
  white-space: nowrap;
  width: 100%;
`;

export function NewWikiDoneButton({
  form,
  isCreateMainWorkspace,
  isCreateSyncedWorkspace,
}: IWikiWorkspaceFormProps & { isCreateMainWorkspace: boolean; isCreateSyncedWorkspace: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [, hasError, wikiCreationMessage, wikiCreationMessageSetter, hasErrorSetter] = useValidateNewWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form);
  const onSubmit = useNewWiki(isCreateMainWorkspace, isCreateSyncedWorkspace, form, wikiCreationMessageSetter, hasErrorSetter);
  const [logPanelOpened, logPanelSetter, progressBarOpen] = useWikiCreationProgress(wikiCreationMessage, hasError);
  if (hasError) {
    return (
      <CloseButton variant="contained" disabled={true}>
        {wikiCreationMessage}
      </CloseButton>
    );
  }
  return (
    <>
      {progressBarOpen && <LinearProgress color="secondary" />}
      <Snackbar open={logPanelOpened} autoHideDuration={5000} onClose={() => logPanelSetter(false)}>
        <Alert severity="info">{wikiCreationMessage}</Alert>
      </Snackbar>

      {isCreateMainWorkspace ? (
        <CloseButton variant="contained" color="secondary" onClick={onSubmit}>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.CreateWiki')}
          </Typography>
          <WikiLocation>{form.wikiFolderLocation}</WikiLocation>
        </CloseButton>
      ) : (
        <CloseButton variant="contained" color="secondary" onClick={onSubmit}>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.CreateWiki')}
          </Typography>
          <WikiLocation>{form.wikiFolderLocation}</WikiLocation>
          <Typography variant="body1" display="inline">
            {t('AddWorkspace.AndLinkToMainWorkspace')}
          </Typography>
        </CloseButton>
      )}
    </>
  );
}
